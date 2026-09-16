// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

async function load() {
  vi.resetModules()
  let def: any
  ;(globalThis as any).window.__ModuleLoader__ = { load: (d: any) => { def = d } }
  await import('../dsh/client.js')
  return (def as any).factory((name: string) => {
    if (name === 'react') return require('react')
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return {}
    throw new Error('unexpected require ' + name)
  }) as { __internal: any; apply: Function; inject: string[] }
}

function imageAtt(id: string) {
  return {
    kind: 'image', id,
    file: new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }),
    previewUrl: 'blob:image-' + id,
  }
}

function fileAtt(id: string, name: string) {
  return {
    kind: 'file', id,
    file: new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'application/octet-stream' }),
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  delete (globalThis as any).fetch
  ;(globalThis as any).fetch = vi.fn()
})

describe('attachment rail', () => {
  it('renders image previews for image attachments', async () => {
    const mod = await load()
    const C = mod.__internal.AttachmentRail
    const host = document.createElement('div')
    document.body.appendChild(host)
    createRoot(host).render(createElement(C, {
      attachments: [imageAtt('i1')],
      canAcceptDrop: true,
      onAddFiles: () => {},
      onRemoveAttachment: () => {},
      uploads: {},
      onRetryFile: () => {},
    }))
    await new Promise((r) => setTimeout(r, 50))
    const imgs = host.querySelectorAll('img')
    expect(imgs.length).toBe(1)
    expect(imgs[0].getAttribute('src')).toBe('blob:image-i1')
    const groups = host.querySelectorAll('[role="group"][aria-label="Pending attachments"]')
    expect(groups.length).toBe(1)
  })

  it('renders blobURL thumbnail for .png file attachments', async () => {
    const mod = await load()
    const C = mod.__internal.AttachmentRail
    const host = document.createElement('div')
    document.body.appendChild(host)
    createRoot(host).render(createElement(C, {
      attachments: [fileAtt('f1', 'shot.png')],
      canAcceptDrop: true,
      onAddFiles: () => {},
      onRemoveAttachment: () => {},
      uploads: {},
      onRetryFile: () => {},
    }))
    await new Promise((r) => setTimeout(r, 50))
    const imgs = host.querySelectorAll('img')
    expect(imgs.length).toBe(1)
    expect(imgs[0].getAttribute('src')).toMatch(/^blob:/)
  })

  it('calls onRemoveAttachment when delete clicked', async () => {
    const mod = await load()
    const C = mod.__internal.AttachmentRail
    const onRemove = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    createRoot(host).render(createElement(C, {
      attachments: [imageAtt('i1')],
      canAcceptDrop: true,
      onAddFiles: () => {},
      onRemoveAttachment: onRemove,
      uploads: {},
      onRetryFile: () => {},
    }))
    await new Promise((r) => setTimeout(r, 50))
    const btns = host.querySelectorAll('button')
    const removeBtn = Array.from(btns).find(b => b.textContent === '×') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
    removeBtn!.click()
    expect(onRemove).toHaveBeenCalledWith('i1')
  })

  it('shows retry button for upload errors', async () => {
    const mod = await load()
    const C = mod.__internal.AttachmentRail
    const onRetry = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    createRoot(host).render(createElement(C, {
      attachments: [fileAtt('f2', 'doc.txt')],
      canAcceptDrop: true,
      onAddFiles: () => {},
      onRemoveAttachment: () => {},
      uploads: { f2: { status: 'error', message: 'nope' } },
      onRetryFile: onRetry,
    }))
    await new Promise((r) => setTimeout(r, 50))
    const btns = Array.from(host.querySelectorAll('button'))
    const retryBtn = btns.find(b => b.textContent === '重试')
    expect(retryBtn).toBeTruthy()
    ;(retryBtn as HTMLButtonElement).click()
    expect(onRetry).toHaveBeenCalledWith('f2')
  })
})