window.__ModuleLoader__.load({
  id: 'dsh-paste-preview',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var verdicts = {}
    var VERDICT_MAX_AGE_MS = 60000

    function currentModelLabel() {
      var buttons = document.querySelectorAll('button[aria-label]')
      for (var i = 0; i < buttons.length; i++) {
        var label = buttons[i].getAttribute('aria-label') || ''
        if (/选择模型|select model|current model/i.test(label)) return label
      }
      return ''
    }

    var _verdictListeners = []

    function onVerdictReady(fn) {
      _verdictListeners.push(fn)
      return function () {
        var idx = _verdictListeners.indexOf(fn)
        if (idx >= 0) _verdictListeners.splice(idx, 1)
      }
    }

    function _notifyVerdictListeners(label, takeover) {
      var list = _verdictListeners.slice()
      for (var i = 0; i < list.length; i++) {
        try { list[i](label, takeover) } catch (e) {}
      }
    }

    function refreshVerdict(label) {
      if (!label) return
      var cached = verdicts[label]
      if (cached && cached.pending) return
      var entry = { pending: true, takeover: cached ? cached.takeover : false, at: cached ? cached.at : 0 }
      verdicts[label] = entry
      if (typeof fetch !== 'function') return
      fetch('/dsh-paste-preview/verdict?model=' + encodeURIComponent(label))
        .then(function (res) {
          if (!res.ok) throw new Error('verdict ' + res.status)
          return res.json()
        })
        .then(function (body) {
          entry.pending = false
          if (body) {
            entry.takeover = body.takeover === true
            entry.at = Date.now()
          }
          _notifyVerdictListeners(label, entry.takeover)
        })
        .catch(function () {
          entry.pending = false
          _notifyVerdictListeners(label, false)
        })
    }

    function startVerdictTracking() {
      function onFocusIn() { refreshVerdict(currentModelLabel()) }
      document.addEventListener('focusin', onFocusIn, true)
      refreshVerdict(currentModelLabel())
      return function () { document.removeEventListener('focusin', onFocusIn, true) }
    }

    var onAddFilesRef = { current: null }

    function imageFilesOf(event) {
      var items = event.clipboardData && event.clipboardData.items
      if (!items) return []
      var files = []
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind !== 'file') continue
        var file = items[i].getAsFile()
        if (file && file.type.indexOf('image/') === 0) files.push(file)
      }
      return files
    }

    function resolveWriteTarget(event) {
      var fromEvent = event.target
      if (fromEvent && typeof fromEvent.closest === 'function') {
        var found = fromEvent.closest('textarea, input, [data-composer-input][contenteditable=true]')
        if (found) return found
      }
      var active = document.activeElement
      if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return active
      return null
    }

    function onPaste(event) {
      var files = imageFilesOf(event)
      if (files.length === 0) return
      var label = currentModelLabel()
      refreshVerdict(label)
      var cached = verdicts[label]
      if (!cached || cached.takeover !== true || cached.at === 0 || Date.now() - cached.at > VERDICT_MAX_AGE_MS) return
      var target = resolveWriteTarget(event)
      if (!target) return
      event.preventDefault()
      event.stopImmediatePropagation()
      var rewritten = files.map(function (f) {
        return new File([f], f.name, { type: 'application/octet-stream', lastModified: f.lastModified })
      })
      if (onAddFilesRef.current) onAddFilesRef.current(rewritten)
    }

    function isImageName(name) {
      var lower = (name || '').toLowerCase()
      return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        || lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.heic')
        || lower.endsWith('.heif')
    }

    function objectUrlFor(file) {
      try { return URL.createObjectURL(file) } catch (e) { return null }
    }

    var convertingIds = {}

    function isTouchDevice() {
      return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    }

    function rerouteImageFiles(files) {
      var label = currentModelLabel()
      refreshVerdict(label)
      var cached = verdicts[label]
      if (!cached || cached.takeover !== true || cached.at === 0 || Date.now() - cached.at > VERDICT_MAX_AGE_MS) {
        return { rewritten: files, takeover: false }
      }
      var rewritten = []
      for (var i = 0; i < files.length; i++) {
        var f = files[i]
        if (f.type.indexOf('image/') === 0) {
          rewritten.push(new File([f], f.name, { type: 'application/octet-stream', lastModified: f.lastModified }))
        } else {
          rewritten.push(f)
        }
      }
      return { rewritten: rewritten, takeover: true }
    }

    function AttachmentRail(props) {
      onAddFilesRef.current = props.onAddFiles
      var react = require('react')
      var h = react.createElement
      var useState = react.useState
      var useEffect = react.useEffect
      var useRef = react.useRef

      var _latestPropsRef = useRef(props)
      _latestPropsRef.current = props

      var previewState = useState(null)
      var previewSrc = previewState[0]
      var setPreviewSrc = previewState[1]

      var touchDevice = useState(function () { return isTouchDevice() })[0]

      useEffect(function () {
        var atts = props.attachments || []
        if (atts.length === 0) return

        // Only act when unconverted image attachments exist
        var hasImage = false
        for (var k = 0; k < atts.length; k++) {
          if (atts[k].kind === 'image' && !convertingIds[atts[k].id]) { hasImage = true; break }
        }
        if (!hasImage) return

        var label = currentModelLabel()
        var cached = verdicts[label]
        refreshVerdict(label)

        function doConvert() {
          var latest = _latestPropsRef.current
          var currentAtts = latest ? (latest.attachments || []) : atts
          for (var i = 0; i < currentAtts.length; i++) {
            var a = currentAtts[i]
            if (a.kind !== 'image') continue
            if (convertingIds[a.id]) continue
            var file = a.file
            if (!file) continue
            convertingIds[a.id] = true
            var rewritten = new File([file], file.name, { type: 'application/octet-stream', lastModified: file.lastModified })
            var id = a.id
            if (latest) {
              latest.onRemoveAttachment(id)
              latest.onAddFiles([rewritten])
            }
            break
          }
        }

        if (cached && cached.takeover === true && !cached.pending) {
          // Verdict already ready — convert immediately
          doConvert()
          return
        }

        // Verdict pending — poll until resolved, then convert if takeover
        var timer = setInterval(function () {
          var c = verdicts[label]
          if (!c || c.pending) return
          clearInterval(timer)
          if (c.takeover === true) doConvert()
        }, 150)
        return function () { clearInterval(timer) }
      }, [props.attachments])

      useEffect(function () {
        var ids = {}
        var atts = props.attachments || []
        for (var i = 0; i < atts.length; i++) { ids[atts[i].id] = true }
        var keys = Object.keys(convertingIds)
        for (var j = 0; j < keys.length; j++) {
          if (!ids[keys[j]]) delete convertingIds[keys[j]]
        }
      }, [props.attachments])

      useEffect(function () {
        function fileTransfer(event) {
          var dt = event.dataTransfer
          if (!dt || !dt.types || dt.types.indexOf('Files') === -1) return null
          return dt
        }
        function onDragOver(event) {
          var dt = fileTransfer(event)
          if (!dt) return
          event.preventDefault()
          dt.dropEffect = props.canAcceptDrop ? 'copy' : 'none'
        }
        function onDrop(event) {
          var dt = fileTransfer(event)
          if (!dt) return
          event.preventDefault()
          if (!props.canAcceptDrop) return
          var files = []
          for (var i = 0; i < dt.files.length; i++) { files.push(dt.files[i]) }
          var result = rerouteImageFiles(files)
          props.onAddFiles(result.rewritten)
        }
        document.addEventListener('dragover', onDragOver)
        document.addEventListener('drop', onDrop)
        return function () {
          document.removeEventListener('dragover', onDragOver)
          document.removeEventListener('drop', onDrop)
        }
      }, [props.canAcceptDrop, props.onAddFiles])

      function closePreview() { setPreviewSrc(null) }

      function handleKeyDown(event) {
        if (event.key === 'Escape') closePreview()
      }

      useEffect(function () {
        if (!previewSrc) return
        document.addEventListener('keydown', handleKeyDown)
        return function () { document.removeEventListener('keydown', handleKeyDown) }
      }, [previewSrc])

      var children = (props.attachments || []).map(function (a) {
        var upload = (props.uploads || {})[a.id]
        var preview
        if (a.kind === 'image') {
          preview = a.previewUrl
        } else if (isImageName(a.file && a.file.name)) {
          preview = objectUrlFor(a.file)
        } else {
          preview = null
        }

        var isImage = !!preview
        var fileName = a.file ? a.file.name : ''
        var removeLabel = 'Remove ' + (fileName || 'attachment')

        if (!isImage) {
          var fileActions = [
            h('button', {
              key: 'rm',
              type: 'button',
              'aria-label': removeLabel,
              onClick: (function (id) { return function () { props.onRemoveAttachment(id) } })(a.id),
              style: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }
            }, String.fromCharCode(215)),
          ]
          if (upload && upload.status === 'error') {
            fileActions.push(
              h('button', {
                key: 'retry',
                type: 'button',
                onClick: (function (id) { return function () { props.onRetryFile(id) } })(a.id),
                style: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--dsw-alias-label-link, #4da3ff)' }
              }, '重试')
            )
          }
          return h('div', {
            key: a.id,
            style: { display: 'flex', alignItems: 'center', gap: '4px' }
          },
            h('span', { key: 'name', style: { fontSize: '12px' } }, fileName || 'file'),
            fileActions
          )
        }

        var imgSrc = preview
        var onThumbnailClick = (function (src) { return function () { setPreviewSrc(src) } })(imgSrc)
        var onRemove = (function (id) { return function () { props.onRemoveAttachment(id) } })(a.id)

        var removeBtnStyle = {
          position: 'absolute',
          top: '4px',
          right: '4px',
          zIndex: 1,
          display: 'grid',
          placeItems: 'center',
          width: '18px',
          height: '18px',
          padding: 0,
          border: 'none',
          borderRadius: '50%',
          background: 'var(--dsw-alias-button-contrast-fill, rgba(0,0,0,0.6))',
          color: 'var(--dsw-alias-label-primary-inverted, #fff)',
          cursor: 'pointer',
          fontSize: '12px',
          lineHeight: 1,
          opacity: touchDevice ? 1 : 0,
          transition: 'opacity 0.2s ease-in-out'
        }

        var onEnter = touchDevice ? null : function (e) {
          var btn = e.currentTarget.querySelector('[data-role=remove-btn]')
          if (btn) btn.style.opacity = '1'
        }
        var onLeave = touchDevice ? null : function (e) {
          var btn = e.currentTarget.querySelector('[data-role=remove-btn]')
          if (btn) btn.style.opacity = '0'
        }

        var img = h('img', {
          key: 'img',
          src: imgSrc,
          alt: fileName || 'image',
          style: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', display: 'block' }
        })

        var thumbBtn = h('button', {
          key: 'thumb',
          type: 'button',
          'aria-label': 'Preview ' + fileName,
          onClick: onThumbnailClick,
          style: {
            padding: 0,
            border: '0.5px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255,255,255,0.08))',
            borderRadius: '12px',
            background: 'var(--dsw-alias-interactive-bg-hover, transparent)',
            cursor: 'zoom-in',
            overflow: 'hidden',
            display: 'block'
          }
        }, img)

        var removeBtn = h('button', {
          key: 'rm',
          type: 'button',
          'data-role': 'remove-btn',
          'aria-label': removeLabel,
          onClick: onRemove,
          style: removeBtnStyle
        }, String.fromCharCode(215))

        return h('div', {
          key: a.id,
          style: { position: 'relative', display: 'inline-flex' },
          onMouseEnter: onEnter,
          onMouseLeave: onLeave
        }, thumbBtn, removeBtn)
      })

      var railStyle = { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }

      var lightbox = null
      if (previewSrc) {
        var overlayStyle = {
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
        var closeBtnStyle = {
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1,
          width: '36px',
          height: '36px',
          padding: 0,
          border: 'none',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '20px',
          lineHeight: 1,
          display: 'grid',
          placeItems: 'center'
        }
        lightbox = h('div', {
          key: 'lightbox',
          style: overlayStyle,
          onClick: function (e) { if (e.target === e.currentTarget) closePreview() }
        },
          h('button', {
            type: 'button',
            'aria-label': 'Close preview',
            onClick: closePreview,
            style: closeBtnStyle
          }, String.fromCharCode(215)),
          h('img', {
            src: previewSrc,
            alt: 'Preview',
            style: { maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }
          })
        )
      }

      return h('div', { role: 'group', 'aria-label': 'Pending attachments' },
        h('div', { style: railStyle }, children),
        lightbox
      )
    }

    // Sent messages render rerouted images as plain file cards with no slot to
    // replace them, so the card is enhanced in place. The durable ref is read
    // from the host bubble's React props: its `content` blocks, indexed by the
    // card's `file:<n>` key. Anything unexpected leaves the card untouched.
    function messageImageRef(card) {
      if (!card || !isImageName(card.getAttribute('title'))) return null
      var fiberKey = null
      var keys = Object.keys(card)
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('__reactFiber') === 0) { fiberKey = keys[i]; break }
      }
      if (!fiberKey) return null
      var fiber = card[fiberKey]
      var match = /^file:(\d+)$/.exec((fiber && fiber.key) || '')
      if (!match) return null
      for (var f = fiber.return, depth = 0; f && depth < 20; f = f.return, depth++) {
        var props = f.memoizedProps
        if (!props || !Array.isArray(props.content)) continue
        var atts = props.content.filter(function (b) {
          return b && (b.type === 'image' || b.type === 'file') && b.attachment !== undefined
        })
        var hit = atts[Number(match[1])]
        var ref = hit && hit.type === 'file' ? hit.attachment : null
        if (!ref || typeof ref.attachmentId !== 'string' || typeof ref.bytes !== 'number') return null
        if (ref.name !== card.getAttribute('title')) return null
        return { attachmentId: ref.attachmentId, name: ref.name, bytes: ref.bytes }
      }
      return null
    }

    function messageImageUrl(ref) {
      return '/dsh-paste-preview/file?id=' + encodeURIComponent(ref.attachmentId)
        + '&name=' + encodeURIComponent(ref.name) + '&bytes=' + ref.bytes
    }

    function openLightbox(src) {
      var overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center'
      var close = document.createElement('button')
      close.type = 'button'
      close.setAttribute('aria-label', 'Close preview')
      close.textContent = String.fromCharCode(215)
      close.style.cssText = 'position:absolute;top:16px;right:16px;width:36px;height:36px;padding:0;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;cursor:pointer;font-size:20px;line-height:1'
      var img = document.createElement('img')
      img.src = src
      img.alt = 'Preview'
      img.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px'
      function dismiss() {
        overlay.remove()
        document.removeEventListener('keydown', onKey)
      }
      function onKey(event) { if (event.key === 'Escape') dismiss() }
      overlay.addEventListener('click', function (event) { if (event.target === overlay) dismiss() })
      close.addEventListener('click', dismiss)
      document.addEventListener('keydown', onKey)
      overlay.appendChild(close)
      overlay.appendChild(img)
      document.body.appendChild(overlay)
    }

    function enhanceMessageImages(root) {
      var cards = root.querySelectorAll('[data-message-attachments] [title]:not([data-dpp-thumb])')
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i]
        var ref = messageImageRef(card)
        if (!ref) continue
        card.setAttribute('data-dpp-thumb', '')
        var src = messageImageUrl(ref)
        var button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('aria-label', 'Preview ' + ref.name)
        button.style.cssText = 'display:none;padding:0;border:0.5px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255,255,255,0.08));border-radius:12px;background:transparent;cursor:zoom-in;overflow:hidden'
        var img = document.createElement('img')
        img.alt = ref.name
        img.style.cssText = 'display:block;max-width:240px;max-height:240px;object-fit:contain'
        img.addEventListener('load', (function (b, c) { return function () {
          b.style.display = 'block'
          c.style.display = 'none'
        } })(button, card))
        img.addEventListener('error', (function (b) { return function () { b.remove() } })(button))
        button.addEventListener('click', (function (s) { return function () { openLightbox(s) } })(src))
        img.setAttribute('src', src)
        button.appendChild(img)
        card.parentNode.insertBefore(button, card)
      }
    }

    function startMessageThumbnails() {
      var scheduled = false
      function schedule() {
        if (scheduled) return
        scheduled = true
        setTimeout(function () { scheduled = false; enhanceMessageImages(document) }, 50)
      }
      var observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      schedule()
      return function () { observer.disconnect() }
    }

    function apply(ctx) {
      if (typeof ctx.inject !== 'function') return
      var react
      try { react = require('react') } catch (error) { return }
      try { require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { return }
      var stopVerdict = startVerdictTracking()
      var stopThumbnails = startMessageThumbnails()
      ctx.inject(['slots'], function (scope) {
        scope.slots.inject('conversation.input.attachments', function* () {
          yield scope.slots.register({ name: 'conversation.input.attachments', priority: -1, locale: 'conversation' }, AttachmentRail)
        })
      })
      document.addEventListener('paste', onPaste, true)
      if (typeof ctx.effect === 'function') {
        ctx.effect(function () {
          return function () {
            document.removeEventListener('paste', onPaste, true)
            stopVerdict()
            stopThumbnails()
          }
        }, 'dsh-paste-preview listeners')
      }
    }

    exports.apply = apply
    exports.inject = []
    exports.__internal = {
      messageImageRef: messageImageRef,
      enhanceMessageImages: enhanceMessageImages,
      currentModelLabel: currentModelLabel,
      refreshVerdict: refreshVerdict,
      startVerdictTracking: startVerdictTracking,
      verdicts: verdicts,
      VERDICT_MAX_AGE_MS: VERDICT_MAX_AGE_MS,
      onPaste: onPaste,
      onAddFilesRef: onAddFilesRef,
      AttachmentRail: AttachmentRail,
      rerouteImageFiles: rerouteImageFiles,
    }
    return module.exports
  },
})