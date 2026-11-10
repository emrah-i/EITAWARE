# EITAWARE storefront

Solid.js, TypeScript, Tailwind, Hono, Cloudflare Workers Static Assets, Stripe Payment Links, and direct Resend contact email. The current dark-blue 12-piece set is $79.99 USD.

## Payments and order support

Each product in `src/content/catalog.json` owns its public `payments.stripePaymentLink`. The Dark Blue Everyday Set is `available` and uses the supplied live Payment Link. To change it later, edit that product's JSON value, rebuild, and deploy. Payment Links are public, not environment variables; there is no global URL constant.

```json
"status": "available",
"payments": {
  "stripePaymentLink": "https://buy.stripe.com/your_product_payment_link"
}
```

The shared catalog parser requires available products to have a valid HTTPS `buy.stripe.com` URL without embedded credentials. Draft, coming-soon, and sold-out products may omit the link, but any provided link must validate. The example draft includes an empty `payments` object; add its actual URL before publishing it as available.

The homepage “Buy now,” available catalog cards, and all product purchase actions use plain same-tab anchors to their product's configured link, including prerendered HTML without JavaScript. Product-detail navigation remains available. Switch a product's status to `sold-out` to keep its price and purchase controls visible as native disabled “Sold out” buttons, with no link or arrow. Switch back to `available` after confirming its price, stock, and Payment Link. This applies to catalog cards, homepage featured shopping, and product main/closing/mobile controls. Coming-soon previews remain distinct and drafts stay unpublished. Amazon links are unchanged.

`/checkout` and `/checkout/` resolve the old `product` parameter by product ID and return non-cacheable HTTP 302 redirects. An available product goes to its own Payment Link; no product parameter selects the featured product. Sold-out and coming-soon products go to their detail pages. Unknown, empty, and draft IDs go to `/products`. Quantity, cancellation, and caller-supplied destination parameters are ignored.

There is no custom payment form, session creation/status API, webhook, order database, automatic order email, or automatic fulfillment integration. Manage payments, refunds, customer/order details, receipts, inventory, and fulfillment through Stripe and your operational tools. Amazon purchase links retain their existing URLs and attribution behavior.

`/order-confirmation` is a static thank-you page with a home button. It does not verify payments or expose order details. It is noindex/no-store and excluded from the sitemap. In the Stripe Dashboard, edit the Payment Link and set **After payment → redirect to your website** to:

```text
https://eitaware.com/order-confirmation
```

Set this redirect on the product’s live Payment Link after deploying the page. Configure the Payment Link's product, price, quantity options, delivery restrictions, shipping collection, tax settings, receipts, and owner notifications in Stripe; the website does not enforce them. The product’s JSON URL controls all of its direct purchase links.

## Contact email and secrets

The contact form posts to `/api/contact`. The Worker validates the request and sends directly to `https://api.resend.com/emails`, using `RESEND_API_KEY` from Cloudflare secrets. `EMAIL_FROM` is `EITAWARE <support@eitaware.com>` and `SUPPORT_EMAIL` is `support@eitaware.com` in every environment. The fixed internal recipients are server-only: `support@eitaware.com` and `msqware.official@gmail.com`. The internal message includes the submitted name, email, subject, message, and reference; its Reply-To is the validated submitter email.

After Resend accepts the internal notification, a separate acknowledgment goes to the submitter from the same support sender, with Reply-To `support@eitaware.com` and subject **We’ve received your message — EITAWARE**. It confirms receipt and includes the subject and reference without echoing the full message or promising a response time. Each API request has a 10-second timeout, within the form’s 25-second timeout. Browser requests cannot override senders or internal recipients.

There is no application database, message queue, email trigger, scheduled handler, or background retry. The form reports success only after Resend accepts the internal notification. If that send fails, the form allows a retry and no acknowledgment is attempted. If only the acknowledgment fails, the message is still accepted and the form explains that the acknowledgment could not be sent; the team can still reply. Successful responses retain `accepted` and `reference` and include `acknowledgmentSent` for real submissions. The same form retry reuses separate `eitaware/contact/internal/<reference>` and `eitaware/contact/acknowledgment/<reference>` idempotency keys; Resend retains these keys for 24 hours. Honeypot submissions are silently discarded. Validation, origin checks, body limits, HTML escaping, and Cloudflare edge rate limiting remain enabled. Contact content is not written to application logs.

Before release, verify that **eitaware.com** is verified and enabled for sending in Resend’s Domains dashboard, and that the API key permits sending from this domain. The previous updates.eitaware.com sender alone does not establish this. Then save the API key privately:

```sh
npx wrangler secret put RESEND_API_KEY --env production
```

Never put the key in Wrangler `vars`, frontend code, Git, or command arguments. No payment credentials or webhook signing secret are required by this website. Resend's records and the support inbox hold contact correspondence; Stripe holds payment/order records.

## Local development

Use Node 22.13 or newer.

```sh
npm ci
npm run build
npm run dev:worker
```

Open `http://127.0.0.1:8787` for the Worker preview. For Vite editing, also run `npm run dev` and open `http://127.0.0.1:5173`; Vite proxies API calls and legacy checkout redirects to the local Worker.

To test actual contact sending locally, copy `.env.example` to `.dev.vars.staging` and set a Resend key with a verified sender. These files are ignored by Git. Without the key, the form reports its unavailable state; unit tests mock Resend and never send messages. Localhost URLs are for local development only.

## Checks

```sh
npm run check
npm test
npm run build
node scripts/verify-storefront.mjs
node scripts/check-performance.mjs
node scripts/check-production.mjs
node scripts/smoke-local.mjs
npx wrangler deploy --env production --dry-run --outdir /tmp/eitaware-worker-dry-run
```

The smoke script requires the local Worker at port 8787 (or `EITAWARE_TEST_URL`). It only submits invalid/honeypot contact payloads and never sends a real email or payment. Tests cover direct email acceptance/failure/retries, form abuse protection, legacy redirects, removed endpoints, catalog validation, Amazon links, and the existing UI behavior. Storefront verification checks the actual built HTML, including same-tab purchase anchors without JavaScript and purchase exclusion for coming-soon items.

## Hosting and release

`wrangler.jsonc` disables development hostnames and preview URLs at the top level and in every environment. Only `eitaware.com` and `www.eitaware.com` are public custom domains; the Worker redirects www to the canonical domain. The staging configuration is retained for local development without a public hostname or deployment script. Empty cron lists explicitly clear the previous schedule on deployment.

No database bindings, migrations, or database commands are needed. The previous local application database is removed as part of this refactor; no remote data is deleted. Existing deployed resources, secrets, or webhook registrations are not changed until an operator updates those services. Disable any obsolete Stripe webhook registration when releasing this version, since its former endpoint now returns 404.

```sh
npm run deploy
```

Deployment is a separate release step. Verify the secret, domains, contact email, Stripe after-payment redirect, mobile purchase buttons, and existing Amazon URLs. No live deployment or payment is performed by the checks above.

## Edit products and media

Product content lives in `src/content/catalog.json`. `/products` is the collection grid; each published product has a detail page at `/products/:slug`. The order of the `products` array determines collection order. `featuredProductId` selects the homepage product and must identify an `available` or `sold-out` product. Keep product IDs stable after taking orders; use unique lowercase letters, numbers, and hyphens for IDs and slugs.

To prepare another product, copy the object in `examples/catalog-product.json` into the catalog's `products` array. It is an unpublished `draft` with existing placeholder media so the combined catalog passes validation. Replace its ID, slug, copy, and media with the actual product information before publishing. It does not add a product to the site merely by existing in `examples/`.

| Status | Public behavior | Required launch information |
| --- | --- | --- |
| `draft` | Hidden from the collection and public product pages; cannot be purchased. | Keep the schema's basic content and media fields valid while preparing the product. |
| `coming-soon` | Viewable product page with no purchase action. | Nonempty `whatToExpect`; optional `expectedLaunch` text. |
| `available` | Viewable product with enabled purchase links to its own Stripe Payment Link. | Valid `payments.stripePaymentLink`, integer `priceCents` (for example, `7999` means $79.99), `currency: "usd"`, and matching information in Stripe. |
| `sold-out` | Product details and prices stay visible; all direct purchase controls say Sold out and are disabled. | Valid `priceCents`; the Payment Link can be retained or omitted. |

All products use USD. The schema in `src/shared/catalog-schema.ts` validates required fields during the build. Product entries include `name`, `title`, `subtitle`, `description`, `image`, `gallery`, `contents`, `specifications`, and `care`; use empty arrays when optional descriptive sections do not apply. Optional `careHighlights` lists supported icon kinds (`dishwasher`, `microwave`, `stack`, `lead-free`, `tested`, `refrigerator`) and their labels for the homepage; leave it out when those claims do not apply. Optional product facts include `color`, `material`, `pieces`, `serviceFor`, and `asin`. The optional HTTPS `amazonUrl` catalog field remains accepted for compatibility; it does not control the current storefront's Amazon links. Only include supported product claims. The brand owner confirms supplier information that all products are third-party tested, quality controlled, lead-free, microwave safe, dishwasher safe, and refrigerator safe; the brand-wide FAQ states these facts and retains food safety.

Copy images to `public/images/` and videos to `public/videos/`; reference them with root-relative paths such as `/images/new-product.webp`. The `image` field is the collection cover. The `gallery` array controls media order on the detail page:

- Images need `type: "image"`, `src`, accurate pixel `width`/`height`, descriptive `alt`, and a short `label`; `thumbnail` is optional.
- Videos need `type: "video"`, `src`, a local `poster` image, and a short `label`; `caption` is optional.

Use web-optimized images and MP4 video. Video entries may include `posterWidth` and `posterHeight` as a pair of positive pixel dimensions to reserve the poster’s natural proportions before loading. Asset paths must remain under `/images/` or `/videos/`; check that every referenced file is present. Reordering gallery entries changes their display order without changing the files.

After editing content or media, run the checks above, preview the public pages, then rebuild and redeploy. Drafts remain hidden and coming-soon items have no purchase link. Each available product uses its own configured Payment Link. Match each product and price to its destination in Stripe. There is no multi-product cart or site quantity selector.


## Amazon links and Attribution

`src/shared/amazon.ts` is the authoritative source for the current storefront's Amazon links. `AMAZON_URL` is the main URL, currently the exact supplied Amazon Attribution URL:

```text
https://www.amazon.com/dp/B0H8X1MSP5?maas=maas_adg_24A2C9F4135E9FCE114E5166E9516EB1_afap_abs&ref_=aa_maas&tag=maas
```

All current Amazon links use this complete value. Every placement without an override uses the main value. Do not remove or reorder its attribution query parameters.

`AMAZON_PLACEMENT_URLS` is an optional partial map for placement-specific Attribution links. Its supported keys are `header`, `homepageHero`, `homepageFeatured`, `homepageFaq`, `homepageBottom`, `productPage`, `productPageBottom`, `footer`, `contactPage`, and `checkoutFallback`. `homepageHero`, `homepageFeatured`, `homepageFaq`, and `checkoutFallback` remain reserved compatibility keys without active links. Change only the placements that need their own URL; omitted, empty, or whitespace-only overrides fall back to `AMAZON_URL`.

Paste the complete URL provided by Amazon, preserving its attribution query parameters. `amazonUrl(placement)` accepts HTTPS links on `amazon.com` or `www.amazon.com` with no embedded login credentials and returns the URL without rewriting its query string. An override affects only its named placement. Run the checks, rebuild, and redeploy after changing these values, then verify the rendered links. The current Everyday Set has no catalog `amazonUrl`, so all its active links use this central configuration. For future products, an optional catalog `amazonUrl` remains a compatibility fallback for product-specific links: a placement override wins, then the explicit product URL, then `AMAZON_URL`. Brand-wide links use the main URL or their placement override.

## Motion and image loading

Public content is visible in the initial server-rendered HTML. The small loader in `src/lib/reveal-loader.ts` defers loading until hydration and the first paint finish. Its optional chunk contains `src/lib/reveal.ts` and Motion mini, using native IntersectionObserver for visibility detection. Complete content groups, including their headings, descriptions, calls to action, and media, use a 500ms opacity-only fade with ease-in-out timing. A lightweight CSS animation handles the first paint; Motion handles groups entering the viewport later with the same duration and easing. Groups already visible are never reset or replayed. Explicit `data-reveal-group` markers identify complete groups; `data-reveal-children` batches only the direct children of a container. Do not nest reveal groups. Section backgrounds, navigation, fixed purchase controls, and payment/status feedback remain steady. Reduced-motion preferences, unsupported observers, import/animation failures, keyboard focus, and hash-link targets leave content visible. Base styles and server-rendered content stay visible without JavaScript. Do not reset visible content to transparent, replay effects on scroll, add movement, or delay purchase and support controls.

The Motion module plus reveal initializer must remain within a combined **5KB gzip** budget; `scripts/check-performance.mjs` checks the deferred production chunks plus a conservative gzip estimate of the unminified startup loader. Keep that check when upgrading the animation package. Browser verification should include reduced motion, keyboard focus, anchor navigation, and operation when the motion module fails to load.

Display headings and eyebrow labels omit trailing periods. Headings, eyebrows, and browser titles use no em dashes; body copy, purchase labels, and the guarantee retain their intended punctuation. The standalone homepage intro block is removed. The featured, lifestyle, and FAQ headings are “A beautiful table starts here,” “Every meal beautifully served,” and “Your questions answered.”

Images below the fold use lazy loading and asynchronous decoding through shared media-loading helpers. The homepage hero, first collection card, and initial product-gallery image retain critical-image priority; changing or reordering catalog cards must preserve priority only for the first visible card. Images keep explicit dimensions, responsive sources, and descriptive alternatives. Video playback remains user controlled. The gallery media container and video wrappers use the existing `--cream` page-background token. Gallery photos and videos use `object-fit: contain` so the entire product stays visible.

## Assets and content

The lava-cake gallery photo is retained at `assets/source/detail-lava-cake.png`. The asset-preparation script uses this repository-owned original for `detail-lava-cake.webp` and `detail-lava-cake-640.webp`, rather than the former external Pic 6 image. The gallery retains the full 1500 × 1014 composition, with a 640-pixel-wide responsive alternative.

Optimized assets are included under `public/`. To regenerate from the supplied originals, install ffmpeg and run `npm run assets:prepare`. It reads `../Listing/Listing` and `../Logos/EITAWARE.png` by default; override `EITAWARE_ASSET_ROOT` and `EITAWARE_LOGO` if your folders differ. Original files are never changed. Pic 5 is omitted because its embedded cookbook text is distracting.

Product dimensions are 10-inch dinner plates, 8-inch salad plates, and 5.5-inch bowls, four of each. The brand slogan is “Simple elegance, beautifully served.” The owner supplied the product wording “Lead-free,” “Third-party tested,” “Refrigerator safe,” and “Quality controlled”; the site adds no laboratory names, certification marks, test standards, or inspection-process details. Do not add certifications, manufacturing locations, warranties, reviews, or new product claims without support.

The `/faq` page is prerendered, included in the sitemap, and linked from desktop/mobile navigation and the footer. Its ten expandable answers appear in this order: food safety, included pieces and dimensions, dishwasher use, microwave use, shipping/processing, broken arrivals, returns, refrigerator use, glaze variation, and temperature changes. Keep answers consistent with catalog facts, the shared guarantee in `src/shared/guarantee.ts`, and existing policies. Competitor care pages informed question topics only; their product claims and temperature limits are not EITAWARE specifications. The FAQ uses descriptive metadata and a canonical URL, without FAQ-rich-result claims.

Josefin Sans is self-hosted at `public/fonts/JosefinSans-Variable.ttf`, downloaded unmodified from the [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/josefinsans). The normal variable font supports weights 100–700. Its SIL Open Font License is included at `public/fonts/OFL.txt`; retain the license when redistributing the font. The website does not need a runtime request to Google Fonts.

This is a genuine retail offer. A separate brand website does not guarantee Amazon will validate a List Price or display a strikethrough comparison price.

## Vendor references

- [Stripe Payment Links after payment](https://docs.stripe.com/payment-links/post-payment)
- [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Cloudflare Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
