import type {
  InopsFlowRequest,
  InopsFlowResponseEnvelope,
  InopsFlowStartResponse,
  InopsProduct,
  InopsSearchResult,
} from './types'

export type InopsClientOptions = {
  /** SearchKey (public) */
  searchKey: string
  /** API base, e.g. https://api.inops.io */
  apiUrl?: string
  /** Optional; backend ignores for SearchKey mode but we send a stable value for compatibility */
  shopConfigId?: string
  /** Optional */
  language?: string
  /** Optional */
  referenceId?: string
  /** Optional. Provide your own fetch (e.g. for SSR) */
  fetchImpl?: typeof fetch
}

export type SseEventHandler = (event: any) => void
export type Unsubscribe = () => void

function normalizeBaseUrl(apiUrl?: string): string {
  const fromGlobal =
    typeof window !== 'undefined' ? (window as any).__INOPS_API_BASE_URL__ : ''
  return String(apiUrl || fromGlobal || 'https://apps.inops.io')
    .trim()
    .replace(/\/$/, '')
}

function pickWidgets(env: any): any[] {
  return (
    (env && (env.response?.widgets || env.data?.response?.widgets)) ||
    []
  )
}

function extractSummary(widgets: any[]): string {
  const textW = widgets.find(
    (w) => w && (w.type === 'text' || w.kind === 'text'),
  )
  return String((textW && (textW.text || textW.value)) || '')
}

function extractProducts(widgets: any[]): InopsProduct[] {
  return widgets.filter((w) => w && w.type === 'product') as any
}

async function postFlow(
  baseUrl: string,
  payload: InopsFlowRequest,
  searchKey: string,
  fetchImpl: typeof fetch,
): Promise<InopsFlowStartResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Search-Key': searchKey,
    Authorization: `SearchKey ${searchKey}`,
  }
  const url = `${baseUrl}/shop/flow/execute?searchKey=${encodeURIComponent(
    searchKey,
  )}`
  
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  } catch (networkErr) {
    throw new Error(
      `Network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`
    )
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      msg = j?.message || j?.code || j?.error || msg
    } catch {
      // If response isn't JSON, try to get text
      try {
        const text = await res.text()
        if (text) msg = text.substring(0, 200)
      } catch {}
    }
    throw new Error(msg)
  }
  
  try {
    const json = await res.json()
    return json as any
  } catch (parseErr) {
    throw new Error(
      `Invalid JSON response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
    )
  }
}

export function subscribeToSessionSse(
  baseUrl: string,
  sessionId: string,
  searchKey: string,
  onEvent: SseEventHandler,
  opts?: { fetchImpl?: typeof fetch },
): Unsubscribe {
  const fetchImpl = opts?.fetchImpl || fetch
  const controller = new AbortController()

  ;(async () => {
    const qs = `?searchKey=${encodeURIComponent(searchKey)}`
    const url = `${baseUrl}/sse/session/${encodeURIComponent(sessionId)}${qs}`
    try {
      const res = await fetchImpl(url, {
        headers: {
          'X-Search-Key': searchKey,
          Authorization: `SearchKey ${searchKey}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        // Emit error event instead of silently failing
        try {
          onEvent({
            event: 'flow-error',
            error: `SSE connection failed: ${res.status} ${res.statusText}`,
            status: res.status,
          })
        } catch {}
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let lastEvent: string | null = null

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          const s = line.trim()
          if (!s) continue
          
          // Handle event: lines (SSE event type)
          if (s.startsWith('event: ')) {
            lastEvent = s.slice(7).trim() || null
            continue
          }
          
          // Handle data: lines
          if (s.startsWith('data: ')) {
            const data = s.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              // Normalize event structure: if payload doesn't have event/response structure, wrap it
              const normalized =
                parsed && (parsed.event || parsed.response || (parsed.data && (parsed.data.event || parsed.data.response)))
                  ? parsed
                  : { event: lastEvent, response: parsed, data: { event: lastEvent, response: parsed } }
              onEvent(normalized)
            } catch (parseErr) {
              // Try to emit non-JSON data as-is, or skip silently
              if (data.trim()) {
                try {
                  onEvent({ event: lastEvent, data: data, error: 'parse_error' })
                } catch {}
              }
            }
          }
        }
      }
    } catch (err) {
      // Network/abort errors - emit error event
      if (controller.signal.aborted) return // Don't emit error on intentional abort
      try {
        onEvent({
          event: 'flow-error',
          error: err instanceof Error ? err.message : String(err),
        })
      } catch {}
    }
  })()

  return () => controller.abort()
}

export function createInopsClient(options: InopsClientOptions) {
  const baseUrl = normalizeBaseUrl(options.apiUrl)
  const fetchImpl = options.fetchImpl || fetch

  async function start(payload: InopsFlowRequest): Promise<InopsFlowStartResponse> {
    return postFlow(
      baseUrl,
      {
        ...payload,
        shopConfigId: payload.shopConfigId || options.shopConfigId || 'demo',
        language: payload.language || options.language || 'en',
        referenceId: payload.referenceId || options.referenceId,
      },
      options.searchKey,
      fetchImpl,
    )
  }

  async function search(query: string, opts?: Partial<InopsFlowRequest>) {
    const q = String(query || '').trim()
    if (!q) throw new Error('query.required')
    if (q.length < 3) throw new Error('query.too_short: query must be at least 3 characters')
    return start({ ...(opts || {}), userInput: { type: 'search', value: q } })
  }

  async function runCampaign(campaignId: string, opts?: Partial<InopsFlowRequest>) {
    const cid = String(campaignId || '').trim()
    if (!cid) throw new Error('campaignId.required')
    return start({
      ...(opts || {}),
      userInput: { type: 'campaignId', campaignId: cid },
    })
  }

  function readCampaignIdFromUrl(paramName = 'campaignId'): string {
    if (typeof window === 'undefined') return ''
    try {
      const u = new URL(window.location.href)
      return String(u.searchParams.get(paramName) || '').trim()
    } catch {
      return ''
    }
  }

  /**
   * Convenience: run a campaignId and collect summary/products from SSE.
   * Useful for landing pages where you want "products now" without handling SSE manually.
   * 
   * Waits for flow-end event or timeout, whichever comes first.
   */
  async function runCampaignAndCollect(
    campaignId: string,
    opts?: Partial<InopsFlowRequest> & { timeoutMs?: number },
  ): Promise<InopsSearchResult> {
    const started = await runCampaign(campaignId, opts)
    const sessionId = String((started as any)?.sessionId || '')
    if (!sessionId) return { sessionId: undefined, summary: '', products: [], raw: started }

    let summary = ''
    const products: InopsProduct[] = []
    let hasFlowEnded = false

    const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 20_000
    const startAt = Date.now()
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    return await new Promise((resolve, reject) => {
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (unsub) {
          unsub()
        }
      }

      const finish = () => {
        if (hasFlowEnded) return
        hasFlowEnded = true
        cleanup()
        resolve({ sessionId, summary, products, raw: started })
      }

      const unsub = subscribeToSessionSse(
        baseUrl,
        sessionId,
        options.searchKey,
        (evt) => {
          const ev = String(evt?.event || evt?.data?.event || '').trim()
          
          // Check for flow-end
          if (ev === 'flow-end' || ev === 'end') {
            finish()
            return
          }

          // Check for errors
          if (ev === 'flow-error' || ev === 'flows-error') {
            cleanup()
            reject(new Error(evt?.error || evt?.message || 'Flow error'))
            return
          }

          // Extract widgets
          const widgets = pickWidgets(evt)
          if (Array.isArray(widgets)) {
            const s = extractSummary(widgets)
            if (s) summary = s
            // Accumulate products (don't replace, append new ones)
            const newProducts = extractProducts(widgets)
            for (const p of newProducts) {
              // Deduplicate by productId
              if (!products.find(existing => existing.productId === p.productId)) {
                products.push(p)
              }
            }
          }
        },
        { fetchImpl },
      )

      // Timeout fallback
      timeoutId = setTimeout(() => {
        finish()
      }, timeoutMs)
    })
  }

  return {
    baseUrl,
    search,
    runCampaign,
    runCampaignAndCollect,
    readCampaignIdFromUrl,
    subscribeToSessionSse: (sessionId: string, onEvent: SseEventHandler) =>
      subscribeToSessionSse(baseUrl, sessionId, options.searchKey, onEvent, {
        fetchImpl,
      }),
  }
}


