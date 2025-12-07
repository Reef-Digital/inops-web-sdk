export type MountOptions = {
  searchKey: string;
  apiUrl?: string; // default http://localhost:3000
  minWordsTrigger?: 2 | 3;
  debounceMs?: number;
  layout?: 'inline';
};

type Unsubscribe = () => void;

function normalizeBaseUrl(url?: string): string {
  const base = (url || (typeof window !== 'undefined' ? (window as any).__INOPS_API_BASE_URL__ : '') || 'http://localhost:3000').trim();
  return base.replace(/\/$/, '');
}

async function postFlow(apiBase: string, payload: any, searchKey: string): Promise<{ sessionId?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers['X-Search-Key'] = searchKey;
  headers['Authorization'] = `SearchKey ${searchKey}`;
  const url = `${apiBase}/shop/flow/execute?searchKey=${encodeURIComponent(searchKey)}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = (j?.message || j?.code || msg); } catch {}
    throw new Error(msg);
  }
  try { return await res.json(); } catch { return {}; }
}

function subscribeSse(apiBase: string, sessionId: string, searchKey: string, onData: (data: any) => void): Unsubscribe {
  const ctrl = new AbortController();
  (async () => {
    const qp = `?searchKey=${encodeURIComponent(searchKey)}`;
    const url = `${apiBase}/sse/session/${encodeURIComponent(sessionId)}${qp}`;
    const headers: Record<string, string> = {
      'X-Search-Key': searchKey,
      'Authorization': `SearchKey ${searchKey}`
    };
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;
        try { onData(JSON.parse(payload)); } catch {}
      }
    }
  })().catch(() => {});
  return () => ctrl.abort();
}

function createUi(target: HTMLElement) {
  const root = document.createElement('div');
  const inputRow = document.createElement('div');
  inputRow.style.display = 'flex';
  inputRow.style.gap = '8px';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search products…';
  input.style.flex = '1';
  input.style.padding = '8px';
  input.style.border = '1px solid #d1d5db';
  input.style.borderRadius = '4px';
  const btn = document.createElement('button');
  btn.textContent = 'Search';
  btn.style.padding = '8px 12px';
  btn.style.background = '#111827';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.borderRadius = '4px';
  btn.style.cursor = 'pointer';
  inputRow.appendChild(input);
  inputRow.appendChild(btn);

  const panel = document.createElement('div');
  panel.style.marginTop = '12px';
  panel.style.border = '1px solid #e5e7eb';
  panel.style.borderRadius = '6px';
  panel.style.background = '#fff';
  panel.style.maxHeight = '300px';
  panel.style.overflow = 'auto';

  const list = document.createElement('div');
  panel.appendChild(list);

  const summaryBox = document.createElement('div');
  summaryBox.style.borderTop = '1px solid #e5e7eb';
  summaryBox.style.background = '#eff6ff';
  summaryBox.style.padding = '8px';
  summaryBox.style.fontSize = '14px';
  summaryBox.style.display = 'none';
  panel.appendChild(summaryBox);

  root.appendChild(inputRow);
  root.appendChild(panel);
  target.innerHTML = '';
  target.appendChild(root);

  function setSummary(text: string) {
    if (text) {
      summaryBox.textContent = text;
      summaryBox.style.display = 'block';
    } else {
      summaryBox.textContent = '';
      summaryBox.style.display = 'none';
    }
  }

  function clearList() { list.innerHTML = ''; }
  function addItem(p: any, idx: number) {
    const item = document.createElement('div');
    item.style.padding = '8px';
    item.style.borderTop = '1px solid #f3f4f6';
    const header = document.createElement('div');
    header.style.fontWeight = '600';
    header.style.fontSize = '14px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.innerHTML = `${(p.title || p.name || p.productId || ('Result #' + (idx + 1)))} <span style="color:#6b7280;font-size:12px">(${p.productId || p.id || 'n/a'})</span>`;
    const toggle = document.createElement('div');
    toggle.textContent = '▼';
    toggle.style.fontSize = '12px';
    toggle.style.color = '#6b7280';
    header.appendChild(toggle);
    header.style.cursor = 'pointer';
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.fontSize = '12px';
    pre.style.color = '#374151';
    pre.style.marginTop = '6px';
    pre.style.display = 'none';
    try { pre.textContent = JSON.stringify(p, null, 2); } catch { pre.textContent = String(p); }
    header.onclick = () => {
      const open = pre.style.display !== 'none';
      pre.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? '▼' : '▲';
    };
    item.appendChild(header);
    item.appendChild(pre);
    list.appendChild(item);
  }

  return { input, btn, clearList, addItem, setSummary };
}

export function mount(target: string | Element, options: MountOptions): Unsubscribe | null {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return null;
  const opts: Required<MountOptions> = {
    searchKey: options.searchKey,
    apiUrl: normalizeBaseUrl(options.apiUrl),
    minWordsTrigger: options.minWordsTrigger ?? 3,
    debounceMs: options.debounceMs ?? 350,
    layout: 'inline'
  };

  const ui = createUi(el as HTMLElement);
  let debounce: any = null;
  let unsub: Unsubscribe | null = null;

  async function run(text: string) {
    const v = (text || '').trim();
    if (!v || v.split(/\s+/).length < opts.minWordsTrigger) return;
    ui.btn.disabled = true;
    ui.clearList();
    ui.setSummary('');
    try {
      const { sessionId } = await postFlow(opts.apiUrl, { userInput: { type: 'search', value: v }, shopConfigId: 'demo', language: 'en' }, opts.searchKey);
      ui.btn.disabled = false; // clickable again after accept
      if (unsub) unsub();
      if (sessionId) {
        unsub = subscribeSse(opts.apiUrl, sessionId, opts.searchKey, (env: any) => {
          const widgets = (env && (env.response?.widgets || env.data?.response?.widgets)) || [];
          if (Array.isArray(widgets)) {
            const prods = widgets.filter((w: any) => w && w.type === 'product');
            prods.forEach((p: any, idx: number) => ui.addItem(p, idx));
            const t = widgets.find((w: any) => w && (w.type === 'text' || w.kind === 'text'));
            if (t && (t.text || t.value)) ui.setSummary(t.text || t.value);
          }
        });
      }
    } catch (e: any) {
      ui.btn.disabled = false;
      // Simple error inline
      ui.setSummary(e?.message || 'Search failed');
    }
  }

  ui.input.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') run(ui.input.value);
  });
  ui.input.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => run(ui.input.value), opts.debounceMs);
  });
  ui.btn.addEventListener('click', () => run(ui.input.value));

  return () => { if (unsub) unsub(); };
}

export function unmount(target: string | Element) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  (el as HTMLElement).innerHTML = '';
}

function parseNumber(val: string | undefined, d: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export function scanAndMount() {
  const nodes = document.querySelectorAll('[data-widget="inops-search"]');
  nodes.forEach((node) => {
    const el = node as HTMLElement;
    const searchKey = el.dataset.searchKey || '';
    const apiUrl = el.dataset.apiUrl || '';
    const minWords = parseNumber(el.dataset.minWords, 3) as 2 | 3;
    const debounceMs = parseNumber(el.dataset.debounceMs, 350);
    mount(el, { searchKey, apiUrl, minWordsTrigger: (minWords === 2 ? 2 : 3), debounceMs, layout: 'inline' });
  });
}

if (typeof window !== 'undefined') {
  (window as any).Inops = { mount, unmount, scanAndMount };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scanAndMount());
  } else {
    scanAndMount();
  }
}


