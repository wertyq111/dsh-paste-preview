import { describe, expect, it } from 'vitest'
import { registerFileRoute, registerVerdictRoute, registerDebugRoute } from '../dsh/index.js'

const ID = 'sha256:' + 'a'.repeat(64)
const allow = { requestRejection: () => undefined }
const deny = { requestRejection: () => 401 as const }

function capture(register: Function, hostCtx: any) {
  let route: any
  register({ webServer: { register: (r: any) => { route = r } } }, hostCtx)
  return route
}

function res() {
  const out: any = { code: 0, headers: {}, body: undefined }
  return {
    out,
    writeHead: (c: number, h?: Record<string, string>) => { out.code = c; Object.assign(out.headers, h ?? {}) },
    end: (b?: any) => { out.body = b },
  }
}

function attachments(chunks: Uint8Array[] | Error) {
  const seen: any[] = []
  return {
    seen,
    readFileStream(ref: any) {
      seen.push(ref)
      return (async function* () {
        if (chunks instanceof Error) throw chunks
        for (const c of chunks) yield c
      })()
    },
  }
}

const url = (q: Record<string, string>) => '/dsh-paste-preview/file?' + new URLSearchParams(q).toString()

describe('file route', () => {
  it('rejects unauthenticated requests before touching storage', async () => {
    const store = attachments([new Uint8Array([1])])
    const route = capture(registerFileRoute, { connection: deny, attachments: store })
    const r = res()
    await route.handler({ method: 'GET', headers: {}, url: url({ id: ID, name: 'a.png', bytes: '1' }) }, r)
    expect(r.out.code).toBe(401)
    expect(store.seen).toHaveLength(0)
  })

  it('serves stored image bytes with the image content type', async () => {
    const store = attachments([new Uint8Array([1, 2]), new Uint8Array([3])])
    const route = capture(registerFileRoute, { connection: allow, attachments: store })
    const r = res()
    await route.handler({ method: 'GET', headers: {}, url: url({ id: ID, name: 'shot.PNG', bytes: '3' }) }, r)
    expect(r.out.code).toBe(200)
    expect(r.out.headers['content-type']).toBe('image/png')
    expect(r.out.headers['x-content-type-options']).toBe('nosniff')
    expect([...r.out.body]).toEqual([1, 2, 3])
    expect(store.seen[0]).toEqual({ attachmentId: ID, name: 'shot.PNG', bytes: 3 })
  })

  it('refuses non-image names and malformed ids', async () => {
    const store = attachments([new Uint8Array([1])])
    const route = capture(registerFileRoute, { connection: allow, attachments: store })
    for (const q of [
      { id: ID, name: 'notes.txt', bytes: '1' },
      { id: ID, name: 'x.svg', bytes: '1' },
      { id: 'sha256:zz', name: 'a.png', bytes: '1' },
      { id: ID, name: 'a.png', bytes: 'abc' },
    ]) {
      const r = res()
      await route.handler({ method: 'GET', headers: {}, url: url(q) }, r)
      expect(r.out.code).toBe(400)
    }
    expect(store.seen).toHaveLength(0)
  })

  it('maps a missing object to 404', async () => {
    const missing = Object.assign(new Error('gone'), { code: 'ATTACHMENT_NOT_FOUND' })
    const route = capture(registerFileRoute, { connection: allow, attachments: attachments(missing) })
    const r = res()
    await route.handler({ method: 'GET', headers: {}, url: url({ id: ID, name: 'a.png', bytes: '1' }) }, r)
    expect(r.out.code).toBe(404)
  })
})

describe('existing routes require authentication', () => {
  const llm = { listProviders: () => [], listModels: async () => [] }
  it('verdict and debug answer 401 when the connection rejects', async () => {
    for (const register of [registerVerdictRoute, registerDebugRoute]) {
      const route = capture(register, { llm, connection: deny })
      const r = res()
      await route.handler({ method: 'GET', headers: {}, url: route.path + '?model=x' }, r)
      expect(r.out.code).toBe(401)
    }
  })

  it('fails closed when no connection service is available', async () => {
    const route = capture(registerVerdictRoute, { llm })
    const r = res()
    await route.handler({ method: 'GET', headers: {}, url: route.path + '?model=x' }, r)
    expect(r.out.code).toBe(401)
  })
})
