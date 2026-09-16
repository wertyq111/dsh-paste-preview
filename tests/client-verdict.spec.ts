// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  let def: any
  ;(globalThis as any).window.__ModuleLoader__ = {
    load: (d: any) => { def = d },
  }
  await import('../dsh/client.js')
  return (def as any).factory((name: string) => {
    if (name === 'react') return { createElement: () => null }
    throw new Error('unexpected require ' + name)
  }) as { __internal: any; apply: Function; inject: string[] }
}

describe('client verdict', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    delete (globalThis as any).fetch
  })

  it('reads model label from selector button and fetches verdict on tracking start', async () => {
    const mod = await load()

    // 1. label reading
    const b = document.createElement('button')
    b.setAttribute('aria-label', '选择模型 DeepSeek V4 Flash')
    document.body.appendChild(b)
    expect(mod.__internal.currentModelLabel()).toBe('选择模型 DeepSeek V4 Flash')

    // 2. verdict fetching
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ takeover: true }),
    }))
    ;(globalThis as any).fetch = fetchMock
    const stop = mod.__internal.startVerdictTracking()
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).toHaveBeenCalledWith(
      '/dsh-paste-preview/verdict?model=' + encodeURIComponent('选择模型 DeepSeek V4 Flash')
    )
    stop()
  })
})