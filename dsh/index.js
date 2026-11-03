export const name = 'dsh-paste-preview'
export const inject = ['llm']
// modlens registers vision twins under these provider ids, reusing the
// upstream model id; they must not veto the text-only model they wrap.
const MODLENS_PROVIDER_ID = /^(deepseek-modlens$|modlens-)/
const MODLENS_VISION_NAME = /\(modlens vision\)/i

export async function takeoverVerdict(llm, label, route) {
  if (route) {
    const model = await llm.resolveModelInfo(route.provider, route.model)
    return Array.isArray(model.inputModalities) && !model.inputModalities.includes('image')
  }
  if (typeof label !== 'string' || label.trim() === '') return false
  // A modlens wrapper is selected: it already handles images natively.
  if (MODLENS_VISION_NAME.test(label)) return false
  if (!llm || typeof llm.listProviders !== 'function' || typeof llm.listModels !== 'function') return false
  const lowered = label.toLowerCase()
  let matchedAny = false
  for (const info of llm.listProviders()) {
    const providerId = info && info.id
    if (!providerId) continue
    let models = []
    try {
      models = await llm.listModels(providerId)
    } catch {
      return false
    }
    for (const model of models) {
      if (MODLENS_PROVIDER_ID.test(providerId) && typeof (model && model.name) === 'string' && MODLENS_VISION_NAME.test(model.name)) continue
      for (const candidate of [model && model.name, model && model.id]) {
        if (typeof candidate !== 'string' || candidate.length === 0) continue
        if (!lowered.includes(candidate.toLowerCase())) continue
        const modalities = model && model.inputModalities
        if (!Array.isArray(modalities) || modalities.includes('image')) return false
        if (candidate.length >= 3) matchedAny = true
      }
    }
  }
  return matchedAny
}

const VERDICT_TTL_MS = 15000
const VERDICT_CAP = 32

// Plugin routes sit outside the harness /api fence, so each one asks the
// connection service first; without that service the request is refused.
function rejected(hostCtx, req, res) {
  const connection = hostCtx.connection
  const rejection = connection && typeof connection.requestRejection === 'function'
    ? connection.requestRejection(req)
    : 401
  if (rejection === undefined) return false
  res.writeHead(rejection)
  res.end()
  return true
}

export function registerVerdictRoute(webScope, hostCtx) {
  const verdicts = new Map()
  webScope.webServer.register({
    name: 'dsh-paste-preview-verdict',
    kind: 'exact',
    path: '/dsh-paste-preview/verdict',
    handler: async (req, res) => {
      if (rejected(hostCtx, req, res)) return
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      try {
        const params = new URL(req.url, 'http://localhost').searchParams
        const label = params.get('model') ?? ''
        const provider = params.get('provider')
        const model = params.get('modelId')
        if ((provider === null) !== (model === null) || provider === '' || model === '') {
          res.writeHead(400)
          res.end()
          return
        }
        const route = provider === null ? undefined : { provider, model }
        const cacheKey = route ? 'route:' + JSON.stringify([provider, model]) : 'label:' + label
        const cached = verdicts.get(cacheKey)
        let takeover
        if (cached && Date.now() - cached.at < VERDICT_TTL_MS) {
          takeover = cached.takeover
        } else {
          takeover = await takeoverVerdict(hostCtx.llm, label, route)
          verdicts.set(cacheKey, { takeover, at: Date.now() })
          if (verdicts.size > VERDICT_CAP) verdicts.delete(verdicts.keys().next().value)
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ takeover }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String(error && error.message ? error.message : error) }))
      }
    },
  })
}

export function registerDebugRoute(webScope, hostCtx) {
  webScope.webServer.register({
    name: 'dsh-paste-preview-debug',
    kind: 'exact',
    path: '/dsh-paste-preview/debug',
    handler: async (req, res) => {
      if (rejected(hostCtx, req, res)) return
      try {
        var llm = hostCtx.llm
        if (!llm || typeof llm.listProviders !== 'function') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'llm not available' }))
          return
        }
        var providers = llm.listProviders()
        var providerList = []
        for (var i = 0; i < providers.length; i++) {
          var info = providers[i]
          var entry = { id: info.id, models: [] }
          try {
            var models = await llm.listModels(info.id)
            for (var j = 0; j < models.length; j++) {
              var m = models[j]
              entry.models.push({
                id: m.id,
                name: m.name,
                inputModalities: m.inputModalities,
              })
            }
          } catch (e) {
            entry.error = String(e && e.message ? e.message : e)
          }
          providerList.push(entry)
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ providers: providerList }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String(error && error.message ? error.message : error) }))
      }
    },
  })
}

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const ATTACHMENT_ID = /^sha256:[0-9a-f]{64}$/
const MAX_IMAGE_BYTES = 32 * 1024 * 1024

// Serves back an image that was rerouted through the file path, so sent
// messages can show a thumbnail. Only content-addressed image refs are read,
// through the attachment store, which re-verifies name, size and digest.
export function registerFileRoute(webScope, hostCtx) {
  webScope.webServer.register({
    name: 'dsh-paste-preview-file',
    kind: 'exact',
    path: '/dsh-paste-preview/file',
    handler: async (req, res) => {
      if (rejected(hostCtx, req, res)) return
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      const params = new URL(req.url, 'http://localhost').searchParams
      const id = params.get('id') ?? ''
      const name = params.get('name') ?? ''
      const bytes = Number(params.get('bytes'))
      const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
      const contentType = IMAGE_TYPES[extension]
      if (!ATTACHMENT_ID.test(id) || !contentType || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_IMAGE_BYTES) {
        res.writeHead(400)
        res.end()
        return
      }
      try {
        // Buffered: the store reports digest mismatches only after the last chunk.
        const chunks = []
        for await (const chunk of hostCtx.attachments.readFileStream({ attachmentId: id, name, bytes })) chunks.push(chunk)
        res.writeHead(200, {
          'content-type': contentType,
          'cache-control': 'private, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
        })
        res.end(Buffer.concat(chunks))
      } catch (error) {
        const code = error && error.code
        res.writeHead(code === 'ATTACHMENT_NOT_FOUND' ? 404 : code === 'INVALID_ATTACHMENT_REF' ? 400 : 500)
        res.end()
      }
    },
  })
}

export function apply(ctx) {
  ctx.inject(['webServer', 'connection', 'llm'], (scope) => {
    registerVerdictRoute(scope, { llm: scope.llm, connection: scope.connection })
    registerDebugRoute(scope, { llm: scope.llm, connection: scope.connection })
  })
  ctx.inject(['webServer', 'connection', 'attachments'], (scope) => {
    registerFileRoute(scope, { connection: scope.connection, attachments: scope.attachments })
  })
}