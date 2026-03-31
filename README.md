# @inops/web-sdk

Browser SDK for Inops AI-powered product search. Provides search, bundle discovery, campaign landing pages, and real-time streaming for Shopify and WooCommerce storefronts.

**CDN:** `https://cdn.inops.io/inops-web-sdk@1.2.0/index.global.js`
**API:** `https://api.inops.io`

## Installation

### Script tag (recommended for Shopify/WooCommerce)

```html
<script src="https://cdn.inops.io/inops-web-sdk@1.2.0/index.global.js"></script>
```

### npm (for React/Vue/bundled apps)

```bash
npm install @inops/web-sdk
```

```js
import { createInopsClient } from '@inops/web-sdk';
```

## Quick start

```js
const client = window.Inops.createInopsClient({
  searchKey: 'YOUR_SEARCH_KEY',  // from the Inops merchant portal
});
```

The `searchKey` is a read-only public key safe for client-side use. Get it from **Inops Merchant Portal > Settings > API Keys**.

## Search flow

Inops search is a two-step process:

1. **Start a search** — `POST /shop/flow/execute` returns a `sessionId`
2. **Stream results via SSE** — subscribe to `/sse/session/{sessionId}` for real-time product results

The SDK handles both steps for you.

### Basic search with SSE streaming

```js
const client = window.Inops.createInopsClient({
  searchKey: 'YOUR_SEARCH_KEY',
});

// Step 1: Start the search
const { sessionId } = await client.search('surfboard for beginners');

// Step 2: Stream results
const products = [];
let summary = '';

const unsubscribe = client.subscribeToSessionSse(sessionId, (event) => {
  const ev = event?.event || event?.data?.event || '';

  switch (ev) {
    case 'products':
    case 'ranked-results': {
      // Extract product widgets
      const widgets = event?.response?.widgets || event?.data?.response?.widgets || [];
      const prods = widgets.filter(w => w.type === 'product');
      products.push(...prods);
      renderProducts(products);
      break;
    }

    case 'summary-result': {
      const widgets = event?.response?.widgets || event?.data?.response?.widgets || [];
      const textWidget = widgets.find(w => w.type === 'text');
      if (textWidget) {
        summary = textWidget.text || textWidget.value || '';
        renderSummary(summary);
      }
      break;
    }

    case 'bundle-result': {
      // Bundle search detected — see "Bundle search" section below
      const bundle = event?.response || event?.data?.response || {};
      renderBundle(bundle);
      break;
    }

    case 'flow-end':
      unsubscribe();
      break;

    case 'flow-error':
      console.error('Search failed:', event?.error || event?.message);
      unsubscribe();
      break;
  }
});
```

## SSE event reference

| Event | Description | Payload |
|-------|-------------|---------|
| `products` | Unranked search results (fast, first pass) | `{ response: { widgets: [{ type: 'product', ... }] } }` |
| `ranked-results` | LLM-reranked results with relevance scores and reasons | Same structure as `products` |
| `summary-result` | AI-generated natural language summary | `{ response: { widgets: [{ type: 'text', value: '...' }] } }` |
| `bundle-result` | Bundle search result (multi-category kit) | `{ response: { type: 'bundle', intent, budget, groups: [...] } }` |
| `flow-end` | Search pipeline complete | `{}` |
| `flow-error` | Pipeline error | `{ error: '...', message: '...' }` |

**Important:** For bundle searches, you may receive **multiple** `bundle-result` events (one per bundle variant). Do not close the SSE connection on the first one — wait for `flow-end`.

## Product object

Each product in the results has these fields:

```ts
{
  type: 'product',
  productId: string,       // Shopify product ID (e.g. 'gid://shopify/Product/123')
  title: string,
  description: string,
  brand: string,           // Vendor name
  category: string,        // Product type
  price: number,
  compareAtPrice: number,  // Original price (for sale items)
  color: string,
  gender: string,          // 'male' | 'female' | 'unisex' | 'kids'
  tags: string,
  image: string,           // Product image URL
  imageUrl: string,        // Alias for image
  score: number,           // Search relevance (0-1)
  relevance: number,       // LLM rerank score (0-1)
  reason: string,          // AI-generated reason why this product matches
  metadata: {
    productUrl: string,    // Link to product on store
    imageUrl: string,      // Alias
    productId: string,
  }
}
```

## Bundle search

When a user searches for a multi-category shopping mission (e.g. "my kid wants to start surfing, budget $500"), Inops automatically detects the intent and returns **bundles** — curated product kits across categories.

### Bundle response structure

```ts
{
  type: 'bundle',
  intent: string,          // e.g. "beginner kid surf starter kit"
  budget: number | null,   // User's budget (if mentioned)
  totalScore: number,      // Composite quality score
  groups: [
    {
      role: 'primary',     // 'primary' | 'essential' | 'accessory' | 'consumable'
      label: 'Surfboard',  // Category name
      products: [Product], // Array of products in this category
      budgetAlloc: number, // Budget allocated to this category
    },
    // ... more groups
  ]
}
```

### Handling bundles

```js
client.subscribeToSessionSse(sessionId, (event) => {
  const ev = event?.event || event?.data?.event || '';

  if (ev === 'bundle-result') {
    const bundle = event?.response || event?.data?.response || {};

    console.log('Bundle intent:', bundle.intent);
    console.log('Budget:', bundle.budget);

    // Flatten all products from all groups
    const allProducts = bundle.groups.flatMap(g => g.products);

    // Calculate total
    const total = allProducts.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);
    console.log(`Total: $${total.toFixed(2)}`);

    // Render each product
    allProducts.forEach(product => {
      renderProductCard(product);
    });
  }
});
```

## Campaign landing pages

Run a campaign to show pre-curated products (e.g. seasonal promotions):

```js
const client = window.Inops.createInopsClient({ searchKey: 'YOUR_KEY' });

// Read campaignId from URL (?campaignId=summer_sale_1)
const campaignId = client.readCampaignIdFromUrl('campaignId');

if (campaignId) {
  const result = await client.runCampaignAndCollect(campaignId, { timeoutMs: 10000 });
  console.log('Summary:', result.summary);
  console.log('Products:', result.products);
}
```

## Add to cart (Shopify)

The SDK returns product data — adding to cart is your store's responsibility. Here's how to integrate with Shopify's Cart API:

### Single product

```js
async function addToCart(product) {
  // The productId from Inops maps to a Shopify product.
  // You need the variant ID. If your products have a single variant,
  // you can fetch it from the Storefront API or use the product page URL.
  const variantId = product.variantId || product.metadata?.variantId;

  if (variantId) {
    await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: variantId, quantity: 1 }]
      }),
    });
  } else {
    // Fallback: redirect to product page
    window.location.href = product.metadata?.productUrl || '#';
  }
}
```

### Entire bundle

```js
async function addBundleToCart(bundle) {
  const items = bundle.groups
    .flatMap(g => g.products)
    .filter(p => p.variantId || p.metadata?.variantId)
    .map(p => ({
      id: p.variantId || p.metadata.variantId,
      quantity: 1,
    }));

  if (items.length > 0) {
    await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  }
}
```

## Client API reference

### `createInopsClient(options)`

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `searchKey` | `string` | Yes | — | Public search key from the Inops portal |
| `apiUrl` | `string` | No | `https://api.inops.io` | API endpoint |
| `language` | `string` | No | `'en'` | Language code for AI responses |

Returns a client with these methods:

| Method | Description |
|--------|-------------|
| `search(query, opts?)` | Start a search. Returns `{ sessionId }` |
| `runCampaign(campaignId, opts?)` | Start a campaign. Returns `{ sessionId }` |
| `runCampaignAndCollect(campaignId, opts?)` | Run campaign and collect all results. Returns `{ summary, products }` |
| `subscribeToSessionSse(sessionId, handler)` | Subscribe to SSE events. Returns `unsubscribe()` function |
| `readCampaignIdFromUrl(param?)` | Read `campaignId` from the current URL query string |

## Configuration

### Override API URL

For local development or custom deployments:

```js
// Option 1: Pass directly
const client = createInopsClient({
  searchKey: 'YOUR_KEY',
  apiUrl: 'http://localhost:3000',
});

// Option 2: Global override (before SDK loads)
window.__INOPS_API_BASE_URL__ = 'http://localhost:3000';
```

## Build from source

```bash
npm install
npm run build        # Output: dist/index.global.js (IIFE), dist/index.mjs (ESM), dist/index.cjs (CJS)
npm run build:watch  # Watch mode
```

## Release / deployment

```bash
npm version patch --no-git-tag-version   # bump version
git add package.json
git commit -m "fix: description (vX.Y.Z)"
git tag vX.Y.Z
git push && git push origin vX.Y.Z
```

The GitHub Action builds and deploys to:
```
https://cdn.inops.io/inops-web-sdk@{version}/index.global.js
```

After releasing, update `INOPS_SDK_VERSION` in `shopify-admin-ui/pages/embed.jsx`.

## Examples

See the `examples/` directory:

- `plain.html` — Vanilla JS campaign landing page
- `shopify.liquid` — Shopify theme integration
- `woocommerce.php` — WooCommerce integration
