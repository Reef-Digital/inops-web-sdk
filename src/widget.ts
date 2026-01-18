import { createInopsClient } from './client'
import type { InopsClientOptions } from './client'

export type MountOptions = {
  searchKey: string
  apiUrl?: string
  /** @deprecated Use minCharsTrigger instead. Minimum number of words before triggering search. */
  minWordsTrigger?: 2 | 3
  /** Minimum number of characters before triggering search (default: 3, matching backend validation) */
  minCharsTrigger?: number
  debounceMs?: number
  layout?: 'inline'
}

export type Unsubscribe = () => void

function buildInlineUi(root: Element) {
  const wrap = document.createElement('div')
  const row = document.createElement('div')
  row.style.display = 'flex'
  row.style.gap = '8px'

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Search products…'
  input.style.flex = '1'
  input.style.padding = '8px'
  input.style.border = '1px solid #d1d5db'
  input.style.borderRadius = '4px'

  const btn = document.createElement('button')
  btn.textContent = 'Search'
  btn.style.padding = '8px 12px'
  btn.style.background = '#111827'
  btn.style.color = '#fff'
  btn.style.border = 'none'
  btn.style.borderRadius = '4px'
  btn.style.cursor = 'pointer'

  row.appendChild(input)
  row.appendChild(btn)

  const box = document.createElement('div')
  box.style.marginTop = '12px'
  box.style.border = '1px solid #e5e7eb'
  box.style.borderRadius = '6px'
  box.style.background = '#fff'
  box.style.maxHeight = '300px'
  box.style.overflow = 'auto'

  const list = document.createElement('div')
  box.appendChild(list)

  const summary = document.createElement('div')
  summary.style.borderTop = '1px solid #e5e7eb'
  summary.style.background = '#eff6ff'
  summary.style.padding = '8px'
  summary.style.fontSize = '14px'
  summary.style.display = 'none'
  box.appendChild(summary)

  wrap.appendChild(row)
  wrap.appendChild(box)
  ;(root as any).innerHTML = ''
  root.appendChild(wrap)

  function setSummary(text: string) {
    if (text) {
      summary.textContent = text
      summary.style.display = 'block'
    } else {
      summary.textContent = ''
      summary.style.display = 'none'
    }
  }

  function clearList() {
    list.innerHTML = ''
  }

  function addItem(p: any, idx: number) {
    const item = document.createElement('div')
    item.style.padding = '8px'
    item.style.borderTop = '1px solid #f3f4f6'

    const head = document.createElement('div')
    head.style.fontWeight = '600'
    head.style.fontSize = '14px'
    head.style.display = 'flex'
    head.style.justifyContent = 'space-between'
    head.style.alignItems = 'center'
    head.innerHTML = `${p.title || p.name || p.productId || `Result #${idx + 1}`} <span style="color:#6b7280;font-size:12px">(${p.productId || p.id || 'n/a'})</span>`

    const caret = document.createElement('div')
    caret.textContent = '▼'
    caret.style.fontSize = '12px'
    caret.style.color = '#6b7280'
    head.appendChild(caret)
    head.style.cursor = 'pointer'

    const pre = document.createElement('pre')
    pre.style.whiteSpace = 'pre-wrap'
    pre.style.fontSize = '12px'
    pre.style.color = '#374151'
    pre.style.marginTop = '6px'
    pre.style.display = 'none'
    try {
      pre.textContent = JSON.stringify(p, null, 2)
    } catch {
      pre.textContent = String(p)
    }

    head.onclick = () => {
      const open = pre.style.display !== 'none'
      pre.style.display = open ? 'none' : 'block'
      caret.textContent = open ? '▼' : '▲'
    }

    item.appendChild(head)
    item.appendChild(pre)
    list.appendChild(item)
  }

  return { input, btn, setSummary, clearList, addItem }
}

export function mount(target: string | Element, options: MountOptions): Unsubscribe | null {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) return null

  const cfg: InopsClientOptions = {
    searchKey: options.searchKey,
    apiUrl: options.apiUrl,
  }
  const client = createInopsClient(cfg)

  // Prefer character-based triggering (default 3, matching backend validation)
  // Fall back to word-based if minCharsTrigger not provided but minWordsTrigger is set
  const minCharsTrigger = options.minCharsTrigger ?? 3
  const minWordsTrigger = options.minWordsTrigger // Only used if minCharsTrigger not explicitly set and legacy option provided
  const useCharBased = options.minCharsTrigger !== undefined || !options.minWordsTrigger
  const debounceMs = options.debounceMs ?? 350

  const ui = buildInlineUi(el)
  let debounce: any = null
  let unsub: null | (() => void) = null

  async function run(q: string) {
    const value = (q || '').trim()
    if (!value) return
    
    // Use character-based triggering (modern default) or word-based (legacy)
    if (useCharBased) {
      if (value.length < minCharsTrigger) return
    } else {
      if (minWordsTrigger && value.split(/\s+/).filter(Boolean).length < minWordsTrigger) return
    }

    ui.btn.disabled = true
    ui.clearList()
    ui.setSummary('')

    try {
      const started = await client.search(value, { shopConfigId: 'demo', language: 'en' })
      const sessionId = String((started as any)?.sessionId || '')
      ui.btn.disabled = false
      if (unsub) unsub()
      if (!sessionId) return
      unsub = client.subscribeToSessionSse(sessionId, (evt) => {
        const widgets = (evt && (evt.response?.widgets || evt.data?.response?.widgets)) || []
        if (!Array.isArray(widgets)) return
        widgets
          .filter((w: any) => w && w.type === 'product')
          .forEach((p: any, idx: number) => ui.addItem(p, idx))
        const textW = widgets.find((w: any) => w && (w.type === 'text' || w.kind === 'text'))
        const summary = textW && (textW.text || textW.value)
        if (summary) ui.setSummary(String(summary))
      })
    } catch (e: any) {
      ui.btn.disabled = false
      ui.setSummary(e?.message || 'Search failed')
    }
  }

  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run(ui.input.value)
  })
  ui.input.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => run(ui.input.value), debounceMs)
  })
  ui.btn.addEventListener('click', () => run(ui.input.value))

  return () => {
    if (unsub) unsub()
  }
}

export function unmount(target: string | Element) {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) return
  ;(el as any).innerHTML = ''
}

function numAttr(v: any, fallback: number) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function scanAndMount() {
  document.querySelectorAll('[data-widget="inops-search"]').forEach((node) => {
    const el = node as HTMLElement
    const searchKey = el.dataset.searchKey || ''
    const apiUrl = el.dataset.apiUrl || ''
    // Support both data-min-chars (new) and data-min-words (legacy)
    const minChars = el.dataset.minChars
    const minWords = el.dataset.minWords
    const debounceMs = numAttr(el.dataset.debounceMs, 350)
    mount(el, {
      searchKey,
      apiUrl,
      ...(minChars ? { minCharsTrigger: numAttr(minChars, 3) } : {}),
      ...(minWords && !minChars ? { minWordsTrigger: numAttr(minWords, 3) === 2 ? 2 : 3 } : {}),
      debounceMs,
      layout: 'inline',
    })
  })
}


