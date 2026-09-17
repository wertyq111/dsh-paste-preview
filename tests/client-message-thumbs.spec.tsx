// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

async function load() {
  vi.resetModules()
  let def: any
  ;(globalThis as any).window.__ModuleLoader__ = { load: (d: any) => { def = d } }
  await import('../dsh/client.js')
  return (def as any).factory((name: string) => {
    if (name === 'react') return require('react')
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return {}
    throw new Error('unexpected require ' + name)
  }) as { __internal: any }
}

const ID = 'sha256:' + 'b'.repeat(64)

// Mirrors the host bubble: attachments come from content blocks, cards keyed `file:<index>`.
function Bubble({ content }: { content: any[] }) {
  const atts = content.filter(b => (b.type === 'image' || b.type === 'file') && b.attachment !== undefined)
  return h('div', null, h('div', { 'data-message-attachments': true },
    atts.map((b, i) => b.type === 'file'
      ? h('span', { key: 'file:' + i, title: b.attachment.name, className: 'fileCard' }, b.attachment.name)
      : h('span', { key: 'image:' + i }, 'img'))))
}

function render(content: any[]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  flushSync(() => { createRoot(host).render(h(Bubble, { content })) })
  return host
}

beforeEach(() => { document.body.innerHTML = '' })

describe('sent message image thumbnails', () => {
  it('resolves the durable file ref behind a sent image card', async () => {
    const mod = await load()
    const host = render([
      { type: 'text', text: 'hi' },
      { type: 'file', attachment: { attachmentId: ID, name: 'image.png', bytes: 171202 } },
    ])
    const card = host.querySelector('[title="image.png"]')
    expect(mod.__internal.messageImageRef(card)).toEqual({ attachmentId: ID, name: 'image.png', bytes: 171202 })
  })

  it('shows a thumbnail once it loads, hides the card, and zooms on click', async () => {
    const mod = await load()
    const host = render([{ type: 'file', attachment: { attachmentId: ID, name: 'image.png', bytes: 5 } }])
    mod.__internal.enhanceMessageImages(document)
    const card = host.querySelector('[title="image.png"]') as HTMLElement
    const thumb = host.querySelector('button[aria-label="Preview image.png"]') as HTMLButtonElement
    expect(thumb).toBeTruthy()
    const img = thumb.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/dsh-paste-preview/file?id=' + encodeURIComponent(ID) + '&name=image.png&bytes=5')
    expect(card.style.display).toBe('')
    img.dispatchEvent(new Event('load'))
    expect(card.style.display).toBe('none')
    expect(thumb.style.display).not.toBe('none')

    thumb.click()
    const zoomed = document.querySelector('img[alt="Preview"]') as HTMLImageElement
    expect(zoomed.getAttribute('src')).toBe(img.getAttribute('src'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('img[alt="Preview"]')).toBeNull()

    mod.__internal.enhanceMessageImages(document)
    expect(host.querySelectorAll('button[aria-label="Preview image.png"]')).toHaveLength(1)
  })

  it('keeps the plain card when the thumbnail fails to load', async () => {
    const mod = await load()
    const host = render([{ type: 'file', attachment: { attachmentId: ID, name: 'image.png', bytes: 5 } }])
    mod.__internal.enhanceMessageImages(document)
    host.querySelector('button img')!.dispatchEvent(new Event('error'))
    expect(host.querySelector('button[aria-label="Preview image.png"]')).toBeNull()
    expect((host.querySelector('[title="image.png"]') as HTMLElement).style.display).toBe('')
  })

  it('leaves non-image files and mismatched cards alone', async () => {
    const mod = await load()
    const host = render([
      { type: 'image', attachment: { attachmentId: 'x' } },
      { type: 'file', attachment: { attachmentId: ID, name: 'notes.txt', bytes: 5 } },
    ])
    mod.__internal.enhanceMessageImages(document)
    expect(host.querySelector('button')).toBeNull()
    const card = host.querySelector('[title="notes.txt"]')!
    card.setAttribute('title', 'other.png')
    expect(mod.__internal.messageImageRef(card)).toBeNull()
  })
})
