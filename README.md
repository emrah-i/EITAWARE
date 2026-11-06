# EITAWARE storefront

Solid.js, TypeScript, Tailwind, Hono, Cloudflare Workers Static Assets, D1, Stripe Checkout, and Resend. A small JSON-managed product catalog, initially featuring EITAWARE's dark-blue 12-piece dinnerware set at $79.99 USD. Marketing prices display as `$79.99`; two sets total `$159.98` before applicable sales tax. Checkout totals and historical payment records retain their actual amounts and two decimal places.

Purchase controls fail closed while `/api/product` is loading, unavailable, incompatible with the catalog, or cannot be verified. All checkout fields and quantity/review/payment controls are disabled in those states and while submitting payment. Product-page purchase controls use the same availability validation. A small Solid tooltip explains disabled purchase controls on hover or keyboard focus and dismisses with Escape; Amazon links stay usable. Checkout/contact fields have descriptive placeholders without replacing labels. The square main gallery uses contain sizing so complete photos and videos remain visible. Only the uniform 7:5 thumbnails are center-cropped. Reserved caption space keeps the layout steady between selections. Ordinary privacy, terms, and shipping/returns visits—including restored visits—start at the top; explicit guarantee anchors retain their section jump. No React runtime or tooltip dependency was added.

## Current state

The storefront and API are implemented. Direct checkout is disabled by default. No live Stripe account, tax registrations, Resend verification, MCF seller SKU, or Cloudflare login is included. Missing configuration produces an honest unavailable state with an Amazon purchase link; it does not simulate a successful purchase or contact submission.

The visual system uses self-hosted Josefin Sans for text and controls, serif display headings, a sticky white navigation bar, alternating white/eggshell sections, and subtle rounding on standalone media. The top shipping announcement is a full-width link to `/products`, with a separate dismiss button and visible keyboard focus. The product’s quality-controlled note is inside Details & Care. The feature banner starts tan; subsequent homepage sections alternate white and tan, including when coming-soon products are published. Its six features use six columns on desktop, three on tablet, and two on mobile. Direct checkout remains the filled navy primary action. Yellow Amazon CTAs appear only in the product purchase panel and on contact. The homepage closing, product closing, and unavailable-checkout fallback use plain text links; header and footer links remain quiet. The Amazon-purchase FAQ entry is removed. Hero and featured-product Amazon promotions are removed. The product quantity selector is white. The desktop product gallery stays 24px below the measured navigation height and stops at the section boundary. The main gallery has a responsive square frame with complete, centered photography and video; cream gutters accommodate different source proportions without cropping or stretching. Thumbnails use uniform center-cropped 7:5 frames. All video captions share a reserved grid track sized by its longest wrapped caption, with only the selected caption visible and exposed to screen readers. A ResizeObserver enables sticky positioning only when the entire gallery, thumbnails, and reserved captions fit beneath the header. The square frame is never compressed to fit the viewport. Taller galleries, layouts at 800px or below, and unsupported observers use normal scrolling. Inline emails use safe mail links and are always underlined. Decorative dot separators are removed while prices and sentence punctuation remain. Footer navigation labels use title case; Privacy Policy and Terms of Service sit at the bottom right on desktop/tablet, with no location label. The contact page keeps its support email once in the left column and omits the company/location block and duplicate email prompt. The font license is included at `public/fonts/OFL.txt`. Header and footer wordmarks use live “EITAWARE” text in the brand font; the supplied logo asset remains available for brand metadata. The homepage slogan remains “Simple elegance, beautifully served”; the footer intentionally uses two lines: “Simple Elegance,” and “Beautifully Served.”

Browser titles start with `EITAWARE | `. The homepage uses the shared brand slogan; other routes use their page names, and product pages use the product name with the existing coming-soon marker when applicable. Open Graph titles match the browser titles.

Public pages are prerendered during the build, then hydrated with Solid. Hono serves the API and passes public requests to the asset binding. All requests pass through the Worker so it can apply the www redirect and staging noindex headers. This also means public requests invoke the Worker; budget for Worker request usage.

## Motion and image loading

Public content is visible in the initial server-rendered HTML. The small loader in `src/lib/reveal-loader.ts` defers loading until hydration and the first paint finish. Its optional chunk contains `src/lib/reveal.ts` and Motion mini, using native IntersectionObserver for visibility detection. Complete content groups, including their headings, descriptions, calls to action, and media, use a 500ms opacity-only fade with ease-in-out timing. A lightweight CSS animation handles the first paint; Motion handles groups entering the viewport later with the same duration and easing. Groups already visible are never reset or replayed. Explicit `data-reveal-group` markers identify complete groups; `data-reveal-children` batches only the direct children of a container. Do not nest reveal groups. Section backgrounds, navigation, fixed purchase controls, and payment/status feedback remain steady. Reduced-motion preferences, unsupported observers, import/animation failures, keyboard focus, and hash-link targets leave content visible. Base styles and server-rendered content stay visible without JavaScript. Do not reset visible content to transparent, replay effects on scroll, add movement, or delay purchase and support controls.

The Motion module plus reveal initializer must remain within a combined **5KB gzip** budget; `scripts/check-performance.mjs` checks the deferred production chunks plus a conservative gzip estimate of the unminified startup loader. Keep that check when upgrading the animation package. Browser verification should include reduced motion, keyboard focus, anchor navigation, and operation when the motion module fails to load.

Display headings and eyebrow labels omit trailing periods. Headings, eyebrows, and browser titles use no em dashes; body copy, purchase labels, and the guarantee retain their intended punctuation. The standalone homepage intro block is removed. The featured, lifestyle, and FAQ headings are “A beautiful table starts here,” “Every meal beautifully served,” and “Your questions answered.”

Images below the fold use lazy loading and asynchronous decoding through shared media-loading helpers. The homepage hero, first collection card, and initial product-gallery image retain critical-image priority; changing or reordering catalog cards must preserve priority only for the first visible card. Images keep explicit dimensions, responsive sources, and descriptive alternatives. Video playback remains user controlled. The gallery media container and video wrappers use the existing `--cream` page-background token. Gallery photos and videos use `object-fit: contain` so the entire product stays visible.

## Edit products and media

Product content lives in `src/content/catalog.json`. `/products` is the collection grid; each published product has a detail page at `/products/:slug`. The order of the `products` array determines collection order. `featuredProductId` selects the homepage product and must identify an `available` product. Keep product IDs stable after taking orders; use unique lowercase letters, numbers, and hyphens for IDs and slugs.

To prepare another product, copy the object in `examples/catalog-product.json` into the catalog's `products` array. It is an unpublished `draft` with existing placeholder media so the combined catalog passes validation. Replace its ID, slug, copy, and media with the actual product information before publishing. It does not add a product to the site merely by existing in `examples/`.

| Status | Public behavior | Required launch information |
| --- | --- | --- |
| `draft` | Hidden from the collection and public product pages; cannot be purchased. | Keep the schema's basic content and media fields valid while preparing the product. |
| `coming-soon` | Viewable product page with no purchase action. | Nonempty `whatToExpect`; optional `expectedLaunch` text. |
| `available` | Viewable product with direct purchase controls, subject to server readiness. | Integer `priceCents` (for example, `7999` means $79.99), `currency: "usd"`, and `maxQuantity` from 1 through 10. An actual fulfillment SKU must be configured server-side. |

All products use USD and specify `maxQuantity` from 1 through 10. The schema in `src/shared/catalog-schema.ts` validates required fields during the build. Product entries include `name`, `title`, `subtitle`, `description`, `quantityLabel`, `image`, `gallery`, `contents`, `specifications`, and `care`; use empty arrays when optional descriptive sections do not apply. Optional `careHighlights` lists supported icon kinds (`dishwasher`, `microwave`, `stack`, `lead-free`, `tested`, `refrigerator`) and their labels for the homepage; leave it out when those claims do not apply. Optional product facts include `color`, `material`, `pieces`, `serviceFor`, and `asin`. The optional HTTPS `amazonUrl` catalog field remains accepted for compatibility; it does not control the current storefront's Amazon links. Only include supported product claims. The brand owner confirms supplier information that all products are third-party tested, quality controlled, lead-free, microwave safe, dishwasher safe, and refrigerator safe; the brand-wide FAQ states these facts and retains food safety.

Copy images to `public/images/` and videos to `public/videos/`; reference them with root-relative paths such as `/images/new-product.webp`. The `image` field is the collection cover. The `gallery` array controls media order on the detail page:

- Images need `type: "image"`, `src`, accurate pixel `width`/`height`, descriptive `alt`, and a short `label`; `thumbnail` is optional.
- Videos need `type: "video"`, `src`, a local `poster` image, and a short `label`; `caption` is optional.

Use web-optimized images and MP4 video. Video entries may include `posterWidth` and `posterHeight` as a pair of positive pixel dimensions to reserve the poster’s natural proportions before loading. Asset paths must remain under `/images/` or `/videos/`; check that every referenced file is present. Reordering gallery entries changes their display order without changing the files.

Fulfillment is configured separately in the server-only `src/server/fulfillment.json` map:

```json
{
  "eitaware-dark-blue-12": "YOUR_ACTUAL_SELLER_SKU"
}
```

Add an actual seller SKU for each purchasable product ID. Keep these mappings out of the public catalog. `MCF_SELLER_SKU` is a compatibility fallback for the original `eitaware-dark-blue-12` product only; it does not supply a SKU for new products. An `available` status does not bypass checkout flags, Stripe mode, tax/email readiness, the sales pause, or SKU validation. Inventory is still checked manually in Seller Central.

After editing JSON or adding media, run `npm run check`, `npm test`, and `npm run build`, then redeploy. Preview the collection, each product page, media order, mobile layout, and checkout for the intended product. Confirm that drafts stay hidden and coming-soon products have no checkout path. The built site does not change when a local JSON file is edited; deployment publishes the changes. This catalog does not add variations, a multi-product cart, an admin editor, or a waitlist.

## Amazon links and Attribution

`src/shared/amazon.ts` is the authoritative source for the current storefront's Amazon links. `AMAZON_URL` is the main URL, currently the exact supplied Amazon Attribution URL:

```text
https://www.amazon.com/dp/B0H8X1MSP5?maas=maas_adg_24A2C9F4135E9FCE114E5166E9516EB1_afap_abs&ref_=aa_maas&tag=maas
```

All current Amazon links use this complete value. Every placement without an override uses the main value. Do not remove or reorder its attribution query parameters.

`AMAZON_PLACEMENT_URLS` is an optional partial map for placement-specific Attribution links. Its supported keys are `header`, `homepageHero`, `homepageFeatured`, `homepageFaq`, `homepageBottom`, `productPage`, `productPageBottom`, `footer`, `contactPage`, and `checkoutFallback`. `homepageHero`, `homepageFeatured`, and `homepageFaq` remain reserved configuration keys but have no active homepage links. Change only the placements that need their own URL; omitted, empty, or whitespace-only overrides fall back to `AMAZON_URL`.

Paste the complete URL provided by Amazon, preserving its attribution query parameters. `amazonUrl(placement)` accepts HTTPS links on `amazon.com` or `www.amazon.com` with no embedded login credentials and returns the URL without rewriting its query string. An override affects only its named placement. Run the checks, rebuild, and redeploy after changing these values, then verify the rendered links. The current Everyday Set has no catalog `amazonUrl`, so all its active links use this central configuration. For future products, an optional catalog `amazonUrl` remains a compatibility fallback for product-specific links: a placement override wins, then the explicit product URL, then `AMAZON_URL`. Brand-wide links use the main URL or their placement override.

## Local development

Use Node 22.13 or newer. Node's built-in SQLite powers the test database fixture.

```sh
npm ci
npm run build
npm run db:local
npm run dev:worker
```

Open `http://127.0.0.1:8787` to test the production build in the Cloudflare runtime. For live UI editing, also run `npm run dev` and open `http://127.0.0.1:5173`; Vite proxies `/api` to port 8787.

To configure local test checkout, copy `.dev.vars.example` to `.dev.vars.staging` and replace the examples with **test** credentials. Keep `SITE_URL=http://127.0.0.1:8787` when the Worker serves the frontend, or set it to the Vite URL when developing there. Set `CHECKOUT_ENABLED=true`, configure actual seller SKUs as described above, and use a Stripe CLI webhook signing secret. Email can remain disabled locally; order alerts stay in the durable outbox. To test sending, use a verified sender and your own recipient mailboxes.

```sh
stripe listen --forward-to http://127.0.0.1:8787/api/stripe/webhook \
  --events checkout.session.completed,checkout.session.expired,charge.refunded
```

Use the signing secret returned by that CLI in the local vars file. Never use a live key locally. Do not commit keys or `.dev.vars*` files. `npm test` mocks external Stripe/Resend requests and never sends email or creates payments.

## Checks

```sh
npm run check
npm test
npm run build
node scripts/verify-storefront.mjs
node scripts/check-performance.mjs
npx wrangler deploy --env staging --dry-run
```

`scripts/smoke-local.mjs` verifies public routes, SEO HTML, security headers, unavailable states, and malformed API requests against a running local Worker. Run it with `node scripts/smoke-local.mjs`.

## Cloudflare setup

1. Add `eitaware.com` to your Cloudflare account and ensure its DNS is active.
2. Run `npx wrangler login` in your own terminal.
3. Create independent databases:

```sh
npx wrangler d1 create eitaware-staging
npx wrangler d1 create eitaware-production
```

4. Replace the two placeholder `database_id` values in `wrangler.jsonc` with the corresponding returned IDs. Never bind staging to the production database.
5. Apply schema migrations:

```sh
npm run db:staging
npm run db:production
```

When upgrading an existing installation to the catalog version, apply `migrations/0002_product_snapshots.sql` to each database with the migration commands above before deploying the new Worker. Its additive column defaults backfill historical orders with the original product ID, title, subtitle, image, and ASIN; existing payment, delivery, and fulfillment records remain in place. New orders store their own immutable product snapshots. Preserve original catalog IDs permanently. Inspect a historical order after migration and check that its product and fulfillment details still match the original purchase. Do not replace the database or rerun the initial schema manually.

6. Set the staging `SITE_URL` to its actual `https://eitaware-staging.<your-subdomain>.workers.dev` URL before using hosted test checkout. The initial localhost value is only for development.
7. Add secrets interactively for each environment. A staging secret must use `sk_test_`; production must use `sk_live_`. The webhook secret belongs to that environment's endpoint.

```sh
npx wrangler secret put STRIPE_SECRET_KEY --env staging
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
npx wrangler secret put RESEND_API_KEY --env staging
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production
```

The config binds a native rate limiter (10 attempts/minute per IP and endpoint), enables structured logs, and schedules an email-outbox sweep every five minutes. Production custom-domain routes cover both `eitaware.com` and `www.eitaware.com`; the Worker issues a 308 redirect from www. Confirm that no existing DNS record conflicts before attaching the custom domains.

## Stripe setup and readiness

Create and activate a US Stripe account for **M Sqware LLC**, with EITAWARE branding and support@eitaware.com. Configure payment receipts and customer-facing business details in Stripe Dashboard. The website only offers immediate card payments and supported card wallets; it does not enable delayed methods, coupons, or buyer-adjustable quantities inside Stripe.

Create one webhook endpoint per environment, pointing to `/api/stripe/webhook`, for:

- `checkout.session.completed`
- `checkout.session.expired`
- `charge.refunded`

The locked Stripe SDK version and its default API version are recorded in `package-lock.json`. Configure the webhook endpoint to a compatible API version and recheck the integration before upgrading the SDK.

The delivery form confirms and stores the shipping address before Stripe opens. Customer.shipping and PaymentIntent.shipping carry the same order-specific snapshot. Checkout deliberately omits shipping-address collection so a wallet or billing form cannot change delivery to an unsupported state. Stripe Tax uses the saved Customer shipping address.

Confirm your required sales-tax registrations and obligations, including Maryland, before enabling live payments. Configure the actual registrations, business origin, product tax classification, and tax settings in Stripe Tax. Setting `TAX_READY=true` is an operator assertion that this is complete; it does not register your business, file returns, or remit tax. Stripe Tax collects only where active registrations are configured. Price is exclusive of applicable sales tax.

In production, enable checkout only after all of these are complete:

- Active live Stripe key and correct live webhook secret.
- Verified Resend sending domain; working order/support mailboxes.
- Actual Amazon MCF seller SKU configured server-side for every available product; the original product can use the `MCF_SELLER_SKU` fallback.
- Tax setup confirmed and `TAX_READY=true`.
- `EMAIL_READY=true` and `CHECKOUT_ENABLED=true`.
- D1 `store_settings.sales_enabled` remains `true`.

The production deployment preflight rejects placeholder database IDs and incomplete readiness flags when checkout is enabled. The API independently validates live/test key mode and readiness on every new checkout.

## Email setup

Verify a Resend sending subdomain such as `updates.eitaware.com`, and add its required DNS records without replacing your existing mailbox MX records. Configure `EMAIL_FROM` to a verified address. `orders@eitaware.com` receives paid-order alerts; `support@eitaware.com` receives website inquiries. Incoming customer email is used only as Reply-To for contact messages.

Order/contact records and their outbox entries commit together. Notifications use an atomic two-minute lease, a stable Resend idempotency key, and bounded exponential retries. Ambiguous failures stop within Resend's 24-hour idempotency window and become `needs_review`; never blindly resend an ambiguous old alert, since the owner may already have fulfilled it.

Stripe sends the customer's payment receipt. The owner sends shipping/tracking messages manually after MCF submission/shipment. No automatic Amazon API integration is included.

## Manual order and MCF workflow

1. Read the paid-order email. It contains the website reference, Stripe references, total, tax, SKU, quantity, buyer email, and confirmed delivery address.
2. Open Stripe Dashboard and verify the current payment/refund status before shipping. Emails may arrive late or repeat; fulfill each website reference only once.
3. Check FBA/MCF stock. In Seller Central, create an MCF order using the seller SKU, quantity, confirmed recipient/address, and standard delivery. Use the website reference as the MCF order reference.
4. Record the MCF order ID in the Stripe payment's notes or your order log. Submit within the promised 1–2 business day handling window.
5. Send the buyer their delivery estimate and tracking when available. Direct orders do not inherit Amazon Prime or Amazon marketplace return promises.
6. For an eitaware.com order with any broken piece, ask the customer to email support@eitaware.com within 7 days of delivery with their order reference and a required in-depth video clearly showing the set, all damaged pieces, and the packaging. Arrange a brand-new replacement set at no cost or a full refund under the guarantee below. A replacement means a complete new set, not just the broken piece; use the correct set SKU and quantity in MCF. Do not charge replacement shipping or require the customer to ship anything back. Record the replacement MCF reference against the original website order so it is not mistaken for duplicate fulfillment.
7. For other returns, ask the customer to contact support within 30 days of delivery, then send return instructions. Unused sets need original packaging. Buyer pays return shipping unless we sent the wrong item. Do not tell customers to return items to an unspecified warehouse.
8. Handle any authorized physical return through your MCF process and issue payment refunds separately in Stripe. The broken-arrival guarantee does not require a physical return. Partial/full refunds update the local order state through `charge.refunded`.

Reconcile Stripe's paid payments with owner emails and MCF records regularly; email is not the sole order record. The public confirmation page distinguishes paid, fully refunded, and partially refunded orders. The Stripe Dashboard remains authoritative for the exact refund amount and current payment details.

### Broken-arrival guarantee

The customer-facing promise in `src/shared/guarantee.ts` applies to orders placed on eitaware.com:

> If any piece arrives broken, you must email support@eitaware.com within 7 days of delivery with your order reference and an in-depth video clearly showing the set, all damaged pieces, and the packaging. We'll send a brand-new replacement set at no cost or provide a full refund. No need to ship anything back.

Honor this promise separately from the 30-day unused-item return policy. Amazon purchases remain subject to Amazon's order-support process.

### Pause and resume sales

Stock is monitored manually. Pausing the D1 setting blocks new sessions without a deployment. The helper also attempts two sweeps to expire unpaid sessions already created:

```sh
# Set STRIPE_SECRET_KEY privately in your terminal for the matching environment.
npm run store:pause -- --env production
```

Check Stripe for payments completing during the pause and any session-expiration failures. In-flight payment races can still complete; reconcile/refund unavailable orders rather than creating an unfulfillable MCF request.

Use the same `store:pause` workflow before changing a live price. Confirm that existing unpaid Stripe sessions have been expired, resolve expiration failures and payments already in flight, then edit `priceCents`, rebuild, and deploy. Existing open sessions can otherwise retain the old price. Never rewrite historical paid-order prices, totals, or product snapshots to match a new retail price. Resume only after checking the new storefront price, checkout total, and stock.

Resume only after checking stock:

```sh
npx wrangler d1 execute DB --remote --env production \
  --command "UPDATE store_settings SET value='true' WHERE key='sales_enabled';"
```

### Recover notifications

Use Cloudflare logs for `email_needs_review` / `email_processing_failed`. Inspect references and delivery status with D1; avoid exporting full addresses unnecessarily:

```sh
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT id,kind,status,attempts,last_error,provider_id FROM email_outbox WHERE status!='sent' ORDER BY created_at;"
```

Compare the corresponding Stripe payment/Resend delivery and MCF reference before manually recovering a notification. A sent alert is not proof of shipment. Keep access to D1, email, Stripe, and Seller Central restricted to operators.

## Deployment and release

```sh
npm run deploy:staging
# Rehearse test payment, notification, Stripe shipping details and MCF entry.
npm run deploy
```

The public storefront can deploy with checkout disabled while onboarding is completed. Do not claim a live checkout or completed fulfillment rehearsal until actual test credentials and verified email are used.

For release, verify all pages and Amazon links, test Stripe approval/decline/3DS, cancel and resume, inspect the owner email, check the delivery address in Stripe, and prepare an MCF order from those fields. Confirm Maryland/other required tax collection with your configured registrations. Check mobile navigation, galleries, keyboard focus, and form errors. Production checkout and confirmation pages are noindex/no-store; staging adds noindex to all responses.

Use Workers deployments/rollback to revert application code. Migrations are additive; do not delete a production database during rollback. Review Cloudflare logs, failed Stripe webhooks, and email outbox status after launch. Public APIs expose no delivery address or email in order-status responses.

## Assets and content

Optimized assets are included under `public/`. To regenerate from the supplied originals, install ffmpeg and run `npm run assets:prepare`. It reads `../Listing/Listing` and `../Logos/EITAWARE.png` by default; override `EITAWARE_ASSET_ROOT` and `EITAWARE_LOGO` if your folders differ. Original files are never changed. Pic 5 is omitted because its embedded cookbook text is distracting.

Product dimensions are 10-inch dinner plates, 8-inch salad plates, and 5.5-inch bowls, four of each. The brand slogan is “Simple elegance, beautifully served.” The owner supplied the product wording “Lead-free,” “Third-party tested,” “Refrigerator safe,” and “Quality controlled”; the site adds no laboratory names, certification marks, test standards, or inspection-process details. Do not add certifications, manufacturing locations, warranties, reviews, or new product claims without support.

The `/faq` page is prerendered, included in the sitemap, and linked from desktop/mobile navigation and the footer. Its ten expandable answers appear in this order: food safety, included pieces and dimensions, dishwasher use, microwave use, shipping/processing, broken arrivals, returns, refrigerator use, glaze variation, and temperature changes. Keep answers consistent with catalog facts, the shared guarantee in `src/shared/guarantee.ts`, and existing policies. Competitor care pages informed question topics only; their product claims and temperature limits are not EITAWARE specifications. The FAQ uses descriptive metadata and a canonical URL, without FAQ-rich-result claims.

Josefin Sans is self-hosted at `public/fonts/JosefinSans-Variable.ttf`, downloaded unmodified from the [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/josefinsans). The normal variable font supports weights 100–700. Its SIL Open Font License is included at `public/fonts/OFL.txt`; retain the license when redistributing the font. The website does not need a runtime request to Google Fonts.

This is a genuine retail offer. A separate brand website does not guarantee Amazon will validate a List Price or display a strikethrough comparison price.

## Vendor references

- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Stripe webhook fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe Tax with hosted Checkout](https://docs.stripe.com/tax/checkout/page)
- [Cloudflare deployment and pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Amazon MCF guide](https://supplychain.amazon.com/learn/seller-central-guide)
