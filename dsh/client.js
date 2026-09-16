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

    function refreshVerdict(label) {
      if (!label) return
      var cached = verdicts[label]
      if (cached && cached.pending) return
      var entry = { pending: true, takeover: cached ? cached.takeover : false, at: cached ? cached.at : 0 }
      verdicts[label] = entry
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
        })
        .catch(function () {
          entry.pending = false
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

    function AttachmentRail(props) {
      onAddFilesRef.current = props.onAddFiles
      var react = require('react')
      var h = react.createElement
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
        var body = preview
          ? h('img', { key: a.id, src: preview, alt: a.file ? a.file.name : '', style: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' } })
          : h('span', { key: a.id, style: { fontSize: '12px' } }, a.file ? a.file.name : 'file')
        var actions = [
          h('button', { key: 'remove', type: 'button', 'aria-label': 'Remove ' + (a.file ? a.file.name : 'attachment'), onClick: function () { props.onRemoveAttachment(a.id) } }, '×'),
        ]
        if (upload && upload.status === 'error') {
          actions.push(h('button', { key: 'retry', type: 'button', onClick: function () { props.onRetryFile(a.id) } }, '重试'))
        }
        return h('div', { key: a.id, style: { display: 'flex', alignItems: 'center', gap: '4px' } }, body, actions)
      })
      return h('div', { role: 'group', 'aria-label': 'Pending attachments', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, children)
    }

    function apply(ctx) {
      if (typeof ctx.inject !== 'function') return
      var react
      try { react = require('react') } catch (error) { return }
      try { require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { return }
      var stopVerdict = startVerdictTracking()
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
          }
        }, 'dsh-paste-preview listeners')
      }
    }

    exports.apply = apply
    exports.inject = []
    exports.__internal = {
      currentModelLabel: currentModelLabel,
      refreshVerdict: refreshVerdict,
      startVerdictTracking: startVerdictTracking,
      verdicts: verdicts,
      VERDICT_MAX_AGE_MS: VERDICT_MAX_AGE_MS,
      onPaste: onPaste,
      onAddFilesRef: onAddFilesRef,
      AttachmentRail: AttachmentRail,
    }
    return module.exports
  },
})