// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  let def: any
  ;(globalThis as any).window.__ModuleLoader__ = { load: (d: any) => { def = d } }
  await import('../dsh/client.js')
  return (def as any).factory((name: string) => {
    if (name === 'react') return { createElement: () => null }
    throw new Error('unexpected require ' + name)
  }) as { __internal: any; apply: Function; inject: string[] }
}

function pasteEvent(file: File) {
  const ev: any = {
    clipboardData: {
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
    },
    target: { closest: () => null },
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  }
  return ev
}

function pngFile(name: string) {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
}

function setupActiveTextarea() {
  const ta = document.createElement('textarea')
  document.body.appendChild(ta)
  ta.focus()
  return ta
}

beforeEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).fetch = vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ takeover: true }),
  }))
})

describe('paste rerouting', () => {
  it('rewrites image files to octet-stream and calls onAddFiles when takeover is fresh', async () => {
    const mod = await load()
    mod.__internal.verdicts['select model X'] = { takeover: true, at: Date.now(), pending: false }
    const b = document.createElement('button')
    b.setAttribute('aria-label', 'select model X')
    document.body.appendChild(b)
    setupActiveTextarea()
    const got: File[] = []
    mod.__internal.onAddFilesRef.current = (files: File[]) => { got.push(...files) }
    const ev = pasteEvent(pngFile('a.png'))
    mod.__internal.onPaste(ev)
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(got).toHaveLength(1)
    expect(got[0].type).toBe('application/octet-stream')
    expect(got[0].name).toBe('a.png')
  })

  it('leaves the paste alone when takeover is false', async () => {
    const mod = await load()
    mod.__internal.verdicts['select model Y'] = { takeover: false, at: Date.now(), pending: false }
    const b = document.createElement('button')
    b.setAttribute('aria-label', 'select model Y')
    document.body.appendChild(b)
    setupActiveTextarea()
    const got: File[] = []
    mod.__internal.onAddFilesRef.current = (files: File[]) => { got.push(...files) }
    const ev = pasteEvent(pngFile('a.png'))
    mod.__internal.onPaste(ev)
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(got).toHaveLength(0)
  })
})