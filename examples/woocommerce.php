<?php
/**
 * Inops campaignId example (WooCommerce / WordPress)
 *
 * Add this in a theme template or via a shortcode.
 * Visitor arrives with ?campaignId=summer_sale_1 → show products automatically.
 */
?>

<div id="inops-campaign-results" style="margin: 24px 0;"></div>

<script>
  // window.__INOPS_API_BASE_URL__ = "https://api.inops.io";
</script>

<script src="https://YOUR_CDN/inops-web-sdk@1.1.0/index.global.js"></script>
<script>
  (async function () {
    if (!window.Inops) return;

    var searchKey = "PASTE_YOUR_SEARCH_KEY";
    var client = window.Inops.createInopsClient({
      searchKey: searchKey,
      apiUrl: window.__INOPS_API_BASE_URL__ || "https://api.inops.io",
    });

    var campaignId = client.readCampaignIdFromUrl("campaignId");
    if (!campaignId) return;

    var root = document.getElementById("inops-campaign-results");
    if (!root) return;
    root.innerHTML = "<div style='color:#6b7280;font-size:14px'>Loading…</div>";

    var result = await client.runCampaignAndCollect(campaignId, { timeoutMs: 4500 });
    var products = (result.products || []).slice(0, 12);

    if (!products.length) {
      root.innerHTML = "<div style='color:#6b7280;font-size:14px'>No results.</div>";
      return;
    }

    root.innerHTML =
      "<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px'>" +
      products
        .map(function (p) {
          // In WooCommerce you usually route to /product/<slug>. If you only have productId, you can map it server-side.
          return (
            "<div style='border:1px solid #e5e7eb;border-radius:10px;padding:12px'>" +
            "<div style='font-weight:600;color:#111827'>" +
            (p.title || p.productId) +
            "</div>" +
            "<div style='color:#6b7280;font-size:12px;margin-top:4px'>" +
            p.productId +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>";
  })();
</script>


