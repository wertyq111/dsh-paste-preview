import { describe, expect, it } from 'vitest'
import { registerVerdictRoute } from '../dsh/index.js'

function harness(models: any[]) {
  let captured: any
  const webScope = {
    webServer: {
      register: (route: any) => { captured = route },
    },
  }
  const hostCtx = {
    llm: {
      listProviders: () => [{ id: 'p1' }],
      listModels: async () => models,
    },
  }
  registerVerdictRoute(webScope, hostCtx)
  return captured
}

function res() {
  const out: any = { code: 0, body: '' }
  return {
    out,
    writeHead: (c: number) => { out.code = c },
    end: (b?: string) => { out.body = b ?? '' },
  }
}

describe('verdict route', () => {
  it('registers the expected path', () => {
    const route = harness([{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', inputModalities: ['text'] }])
    expect(route.path).toBe('/dsh-paste-preview/verdict')
    expect(route.kind).toBe('exact')
  })

  it('answers takeover true for a text-only match', async () => {
    const route = harness([{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', inputModalities: ['text'] }])
    const r = res()
    await route.handler(
      { method: 'GET', url: '/dsh-paste-preview/verdict?model=' + encodeURIComponent('DeepSeek V4 Flash') },
      r
    )
    expect(r.out.code).toBe(200)
    expect(JSON.parse(r.out.body).takeover).toBe(true)
  })

  it('rejects non-GET with 405', async () => {
    const route = harness([])
    const r = res()
    await route.handler({ method: 'POST', url: '/dsh-paste-preview/verdict' }, r)
    expect(r.out.code).toBe(405)
  })
})