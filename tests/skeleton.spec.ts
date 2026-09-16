// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

describe('skeleton', () => {
  it('client bundle registers a factory and exports apply', async () => {
    let def: any
    ;(globalThis as any).window.__ModuleLoader__ = {
      load: (d: unknown) => { def = d },
    }
    await import('../dsh/client.js')
    expect(def).toBeTruthy()
    expect((def as any).id).toBe('dsh-paste-preview')
    const mod = (def as any).factory((name: string) => {
      if (name === 'react') return { createElement: () => null }
      throw new Error('unexpected require ' + name)
    })
    expect(typeof mod.apply).toBe('function')
    expect(Array.isArray(mod.inject)).toBe(true)
  })

  it('host half exports name/inject/apply', async () => {
    const mod = await import('../dsh/index.js')
    expect(mod.name).toBe('dsh-paste-preview')
    expect(mod.inject).toContain('llm')
    expect(typeof mod.apply).toBe('function')
  })
})