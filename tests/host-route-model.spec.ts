import { describe, expect, it, vi } from 'vitest'
import { takeoverVerdict, registerVerdictRoute } from '../dsh/index.js'

describe('exact selected model route', () => {
  it('checks the selected provider even when another provider serves a vision twin', async () => {
    const resolveModelInfo = vi.fn(async () => ({ inputModalities: ['text'] }))
    expect(await takeoverVerdict({ resolveModelInfo }, 'route', { provider: 'siliconflow', model: 'model-a' })).toBe(true)
    expect(resolveModelInfo).toHaveBeenCalledWith('siliconflow', 'model-a')
  })

  it('keeps native images on a selected vision route', async () => {
    const resolveModelInfo = vi.fn(async () => ({ inputModalities: ['text', 'image'] }))
    expect(await takeoverVerdict({ resolveModelInfo }, 'route', { provider: 'modlens-siliconflow', model: 'model-a' })).toBe(false)
  })

  it('passes explicit route query fields through the authenticated endpoint', async () => {
    let route: any
    const resolveModelInfo = vi.fn(async () => ({ inputModalities: ['text'] }))
    registerVerdictRoute({ webServer: { register: (value: any) => { route = value } } }, {
      llm: { resolveModelInfo }, connection: { requestRejection: () => undefined },
    })
    const response = { writeHead: vi.fn(), end: vi.fn() }
    await route.handler({ method: 'GET', url: '/dsh-paste-preview/verdict?model=route&provider=p&modelId=m' }, response)
    expect(response.writeHead).toHaveBeenCalledWith(200, { 'content-type': 'application/json' })
    expect(resolveModelInfo).toHaveBeenCalledWith('p', 'm')
    expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({ takeover: true })
  })
})
