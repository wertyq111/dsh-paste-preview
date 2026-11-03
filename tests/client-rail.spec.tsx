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
  ;(globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ takeover: false }) }))
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

  it('matches DS Bot rail selector without reading as a CSS Module rail', async () => {
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
    const rail = host.querySelector('[role="group"][aria-label="Pending attachments"]') as HTMLElement
    // DS Bot lays the composer out around [class*="_rail"].
    expect(rail.matches('[class*="_rail"]')).toBe(true)
    // The native composer card is a column flexbox whose height can be definite; a
    // percentage basis there sizes the rail to the whole card and hides the editor.
    expect(rail.style.flexBasis.endsWith('%')).toBe(false)
    expect(rail.style.width).toBe('100%')
    // Composer skins such as dsh-claude-style map `<module>_<key>` class names onto
    // native parts; a bare `_rail` key would pull in the native rail's layout.
    for (const name of Array.from(rail.classList)) {
      const key = name.split('_').pop() as string
      expect(/^[a-z][A-Za-z0-9]*$/.test(key)).toBe(false)
    }
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

  it('shows remove button on hover (opacity 1) and hides on leave (opacity 0)', async () => {
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

    // In jsdom, matchMedia('(pointer: coarse)') likely returns false → hover mode.
    const removeBtn = host.querySelector('[data-role="remove-btn"]') as HTMLElement
    expect(removeBtn).toBeTruthy()
    // Default: opacity 0 in non-touch
    expect(removeBtn.style.opacity).toBe('0')

    // React handles mouseenter/mouseleave via mouseover/mouseout on the root.
    // Simulate mouseover on the container (which bubbles) to trigger onMouseEnter.
    const container = removeBtn.parentElement as HTMLElement
    expect(container).toBeTruthy()
    container!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    expect(removeBtn.style.opacity).toBe('1')

    // Simulate mouseout on the container to trigger onMouseLeave.
    container!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    expect(removeBtn.style.opacity).toBe('0')
  })

  it('opens lightbox on thumbnail click and closes on overlay click', async () => {
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

    // Click the thumbnail button
    const thumbBtn = Array.from(host.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Preview x.png'
    ) as HTMLButtonElement
    expect(thumbBtn).toBeTruthy()
    thumbBtn!.click()
    await new Promise((r) => setTimeout(r, 50))

    // Lightbox should be visible
    const lightboxImg = host.querySelector('img[alt="Preview"]') as HTMLImageElement
    expect(lightboxImg).toBeTruthy()
    expect(lightboxImg!.getAttribute('src')).toBe('blob:image-i1')

    // Click the close button
    const closeBtn = Array.from(host.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Close preview'
    ) as HTMLButtonElement
    expect(closeBtn).toBeTruthy()
    closeBtn!.click()
    await new Promise((r) => setTimeout(r, 50))

    // Lightbox should be gone
    expect(host.querySelector('img[alt="Preview"]')).toBeNull()
  })

  it('closes lightbox on Escape key', async () => {
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

    // Open lightbox
    const thumbBtn = Array.from(host.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Preview x.png'
    ) as HTMLButtonElement
    thumbBtn!.click()
    await new Promise((r) => setTimeout(r, 50))
    expect(host.querySelector('img[alt="Preview"]')).toBeTruthy()

    // Press Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    expect(host.querySelector('img[alt="Preview"]')).toBeNull()
  })

  it('registers dragover and drop listeners that call onAddFiles with rerouted files', async () => {
    const mod = await load()
    mod.__internal.verdicts['select model X'] = { takeover: true, at: Date.now(), pending: false }
    const b = document.createElement('button')
    b.setAttribute('aria-label', 'select model X')
    document.body.appendChild(b)

    const C = mod.__internal.AttachmentRail
    const onAddFiles = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    createRoot(host).render(createElement(C, {
      attachments: [],
      canAcceptDrop: true,
      onAddFiles: onAddFiles,
      onRemoveAttachment: () => {},
      uploads: {},
      onRetryFile: () => {},
    }))
    await new Promise((r) => setTimeout(r, 50))

    // Simulate a drop with a PNG file and a text file
    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })
    const txtFile = new File(['hello'], 'b.txt', { type: 'text/plain' })
    const dt = {
      types: ['Files'],
      files: [pngFile, txtFile],
      dropEffect: 'none',
    }
    var dropEv = new Event('drop', { bubbles: true }) as any
    dropEv.dataTransfer = dt
    document.dispatchEvent(dropEv)
    await new Promise((r) => setTimeout(r, 50))

    expect(onAddFiles).toHaveBeenCalledTimes(1)
    const calledWith = onAddFiles.mock.calls[0][0] as File[]
    expect(calledWith.length).toBe(2)
    // PNG should be rewritten to octet-stream
    expect(calledWith[0].type).toBe('application/octet-stream')
    expect(calledWith[0].name).toBe('a.png')
    // Text file should stay text/plain
    expect(calledWith[1].type).toBe('text/plain')
    expect(calledWith[1].name).toBe('b.txt')
  })

  it('does not rewrite images on drop when model supports images', async () => {
    const mod = await load()
    mod.__internal.verdicts['select model Y'] = { takeover: false, at: Date.now(), pending: false }
    const b = document.createElement('button')
    b.setAttribute('aria-label', 'select model Y')
    document.body.appendChild(b)

    const C = mod.__internal.AttachmentRail
    const onAddFiles = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    createRoot(host).render(createElement(C, {
      attachments: [],
      canAcceptDrop: true,
      onAddFiles: onAddFiles,
      onRemoveAttachment: () => {},
      uploads: {},
      onRetryFile: () => {},
    }))
    await new Promise((r) => setTimeout(r, 50))

    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })
    const dt = { types: ['Files'], files: [pngFile], dropEffect: 'none' }
    var dropEv2 = new Event('drop', { bubbles: true }) as any
    dropEv2.dataTransfer = dt
    document.dispatchEvent(dropEv2)
    await new Promise((r) => setTimeout(r, 50))

    const calledWith = onAddFiles.mock.calls[0][0] as File[]
    // Image should keep its original MIME when model supports images
    expect(calledWith[0].type).toBe('image/png')
  })

})