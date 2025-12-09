# Inops Web SDK

Framework‑agnostic JavaScript SDK to embed Inops AI Search in any shop (Liquid, PHP, static sites, React/Vue/Next). Zero dependencies; ships as a single browser bundle and an ESM module.

## Features
- Single script tag (IIFE); no build step required
- Auto‑scan mounts via `data-widget="inops-search"`
- Imperative API: `window.Inops.mount/unmount/scanAndMount`
- Secure header auth (Search Key) and SSE streaming
- Minimal, expandable vertical list + summary

---

## Quick Start (CDN)

```html
<div
  data-widget="inops-search"
  data-search-key="YOUR_SEARCH_KEY"
  data-api-url="https://api.inops.dev"
  data-min-words="3"
  data-debounce-ms="350">
</div>

<script
  src="https://cdn.inops.io/inops-web-sdk@1.0.0/inops.min.js"
  src="https://cdn.inops.io/inops-web-sdk@1.0.0/inops.min.js"
  integrity="sha384-mqekyj1Rt7b+a8CB7it1Uze5lwHffZgza+bqd/0ewQNnupKKN4fIWoKcQfCxa9Gi"
  crossorigin="anonymous"
  referrerpolicy="no-referrer">
</script>
```

The SDK auto‑scans and mounts the widget. Change any `data-*` attribute to configure behavior.

---

## Imperative API (SPAs)

```html
<div id="mySearch"></div>
<script>
  Inops.mount('#mySearch', {
    searchKey: 'YOUR_SEARCH_KEY',
    apiUrl: 'https://api.inops.dev',
    minWordsTrigger: 3,
    debounceMs: 350
  });
  // Inops.unmount('#mySearch')
</script>

---

## Events (optional)
Listen for DOM events to integrate analytics or compose a custom UI:

```js
const el = document.querySelector('[data-widget="inops-search"]')
el.addEventListener('inops:ready',   () => {})
el.addEventListener('inops:start',   () => {})
el.addEventListener('inops:results', (e) => {
  // e.detail = { products, summary, meta, sessionId }
})
el.addEventListener('inops:error',   (e) => console.warn(e.detail))
```

---

## Install & Build (local)

```bash
npm i
npm run build        # ESM + IIFE + d.ts in dist/
node scripts/sri.js  # prints SRI for dist/inops.min.js
```

Outputs:
- `dist/inops.min.js` (IIFE, global `Inops`)
- `dist/index.js` (ESM)
- `dist/index.d.ts` (types)

## Development

```bash
npm run dev         # watch build (IIFE)
```

---

## Security
- Always pin the CDN version and use SRI
- Search Key is scoped/rotatable; sent via headers (`X-Search-Key`, `Authorization: SearchKey`)

---

## Shopify
See `examples/shopify.liquid` for a Liquid snippet that reads a key from `shop.metafields.inops.search_key`.

---

## Troubleshooting
- `searchKey.missing`: Ensure `data-search-key` is set or pass `searchKey` in `mount`.
- 401/403: Check your Search Key and API base URL; confirm CORS config.
- No streaming: If backend doesn’t return a `sessionId`, results still render but without incremental updates; check backend logs.

---

## License
MIT © Reef Digital


