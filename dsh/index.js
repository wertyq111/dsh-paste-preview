export const name = 'dsh-paste-preview'
export const inject = ['llm']
export async function takeoverVerdict(llm, label) {
  if (typeof label !== 'string' || label.trim() === '') return false
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

export function registerVerdictRoute(webScope, hostCtx) {
  const verdicts = new Map()
  webScope.webServer.register({
    name: 'dsh-paste-preview-verdict',
    kind: 'exact',
    path: '/dsh-paste-preview/verdict',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      try {
        const label = new URL(req.url, 'http://localhost').searchParams.get('model') ?? ''
        const cached = verdicts.get(label)
        let takeover
        if (cached && Date.now() - cached.at < VERDICT_TTL_MS) {
          takeover = cached.takeover
        } else {
          takeover = await takeoverVerdict(hostCtx.llm, label)
          verdicts.set(label, { takeover, at: Date.now() })
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

export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    registerVerdictRoute(scope, ctx)
  })
}