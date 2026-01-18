# Inops Web SDK

This SDK helps you integrate Inops **search** and **campaignId landings** into your storefront using a **Search Key** (public read-only key).

## Install (NPM)

```bash
npm i @inops/web-sdk
```

## Install (Script tag)

Use a pinned build from your CDN/build pipeline:

```html
<script src="https://YOUR_CDN/inops-web-sdk@1.1.0/index.global.js"></script>
```

Optionally override the API base at runtime:

```html
<script>
  window.__INOPS_API_BASE_URL__ = "https://api.inops.io";
</script>
```

## Search widget (quick)

```html
<div data-widget="inops-search" data-search-key="YOUR_SEARCH_KEY" data-min-chars="3"></div>
<script src="https://YOUR_CDN/inops-web-sdk@1.1.0/index.global.js"></script>
```

**Options**:
- `data-min-chars`: Minimum characters before triggering search (default: 3, matching backend validation)
- `data-debounce-ms`: Debounce delay in milliseconds (default: 350)
- `data-min-words`: Legacy option for word-based triggering (deprecated, use `data-min-chars` instead)

## Typed client (recommended)

```ts
import { createInopsClient } from "@inops/web-sdk";

const client = createInopsClient({
  searchKey: "YOUR_SEARCH_KEY",
  apiUrl: "https://api.inops.io",
});
```

### Search

**Minimum query length**: 3 characters (enforced by backend and SDK)

```ts
const { sessionId } = await client.search("kid longboard beginner");

if (sessionId) {
  const unsubscribe = client.subscribeToSessionSse(sessionId, (evt) => {
    // evt contains streamed envelopes; pick widgets to render
  });
}
```

**Note**: The SDK validates that queries are at least 3 characters. Queries shorter than 3 characters will throw an error.

## campaignId landing (v1.1)

### Concept

- The merchant creates a campaign in the Inops portal and defines:
  - `campaignId` (merchant-defined id)
  - `searchTerm` (what should be executed)
  - TTL (how long the campaign stays available)
- Your landing URL includes `?campaignId=…`.
- The SDK sends `userInput.type='campaignId'` and Inops returns relevant products.

### Minimal “auto-run from URL” example

```ts
const campaignId = client.readCampaignIdFromUrl("campaignId");
if (campaignId) {
  const { products, summary } = await client.runCampaignAndCollect(campaignId, {
    timeoutMs: 4500,
  });
  // render products + summary
}
```

### Failure behavior (important)

If a campaign is missing or expired, the backend returns a safe empty result (no products).

Recommended UI:
- show a neutral fallback (e.g. “No results.”)
- optionally fall back to your default collection/grid

## Examples

- `examples/plain.html`
- `examples/shopify.liquid`
- `examples/woocommerce.php`

## Build

```bash
npm run typecheck
npm run build
```


