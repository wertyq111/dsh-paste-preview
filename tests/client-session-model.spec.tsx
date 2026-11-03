// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

async function load() {
  vi.resetModules()
  let definition: any
  ;(window as any).__ModuleLoader__ = { load: (value: any) => { definition = value } }
  await import('../dsh/client.js')
  return definition.factory((name: string) => {
    if (name === 'react') return require('react')
    throw new Error('unexpected import ' + name)
  }).__internal
}

beforeEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).fetch = vi.fn(async () => ({ ok: true, json: async () => ({ takeover: true }) }))
})

describe('session-scoped composer without a model selector', () => {
  it('uses the selected session route and reroutes its image without removing the draft text', async () => {
    const internal = await load()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const text = document.createElement('textarea')
    text.value = 'Read this image'
    document.body.appendChild(text)
    const onAddFiles = vi.fn()
    const onRemoveAttachment = vi.fn()
    const route = { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V4.1-Flash' }
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(internal.AttachmentRail, {
        useProjection: (_key: string, select: Function) => select({ next: route, lastUsed: null }),
        attachments: [{ kind: 'image', id: 'image-1', file: new File(['image'], 'test.png', { type: 'image/png' }), previewUrl: 'blob:test' }],
        uploads: {}, canAcceptDrop: true, onAddFiles, onRemoveAttachment, onRetryFile: vi.fn(),
      }))
    })
    await act(async () => {
      await vi.waitFor(() => expect(onAddFiles).toHaveBeenCalledOnce())
    })
    const url = new URL((fetch as any).mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('provider')).toBe(route.provider)
    expect(url.searchParams.get('modelId')).toBe(route.model)
    expect(onRemoveAttachment).toHaveBeenCalledWith('image-1')
    expect(onAddFiles.mock.calls[0][0][0].type).toBe('application/octet-stream')
    expect(onAddFiles.mock.calls[0][0][0].name).toBe('test.png')
    expect(text.value).toBe('Read this image')
    await act(async () => root.unmount())
  })

  it('does not leave an empty attachment row in a text-only draft', async () => {
    const internal = await load()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(createElement(internal.AttachmentRail, {
      attachments: [], uploads: {}, canAcceptDrop: true,
      onAddFiles: vi.fn(), onRemoveAttachment: vi.fn(), onRetryFile: vi.fn(),
    })))
    expect(host.childElementCount).toBe(0)
    await act(async () => root.unmount())
  })
})
