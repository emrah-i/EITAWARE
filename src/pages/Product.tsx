import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { money, storePrice, DEFAULT_PRODUCT_ID, type CatalogProduct, type CatalogMedia } from '../shared/catalog';
import { amazonUrl } from '../shared/amazon';
import { ARRIVES_PERFECT } from '../shared/guarantee';
import { attachStickyGallery } from '../lib/sticky-gallery';
import EmailText from '../components/EmailText';
import GalleryVideo from '../components/GalleryVideo';
import PurchaseAction from '../components/PurchaseAction';
import { ArrowIcon } from '../components/Icon';

export default function Product(props: { product: CatalogProduct }) {
  let gallery: HTMLDivElement | undefined;
  onMount(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    if (gallery && header) onCleanup(attachStickyGallery(gallery, header));
  });
  const product = props.product;
  const [active, setActive] = createSignal(0);
  const media = () => product.gallery[active()];
  const thumbnailAlt = (item: CatalogMedia) => item.thumbnailAlt || (item.type === 'image' ? item.alt : `Video: ${item.label}`);
  const captions = product.gallery.flatMap((item, index) => item.type === 'video' && item.caption ? [{ index, text: item.caption }] : []);
  const comingSoon = product.status === 'coming-soon';
  return <main id="main-content" tabIndex={-1}>
    <div class="product-breadcrumb section-shell" data-reveal-group=""><a href="/">Home</a><span aria-hidden="true">/</span><a href="/products">Collection</a><span aria-hidden="true">/</span><span>{product.name}</span></div>
    <section class="product-layout section-shell" data-reveal-group="" data-reveal-children="" aria-labelledby="product-title">
      <div class="product-gallery" ref={gallery}>
        <div class="gallery-main" aria-label="Selected product media">
          <Show when={media().type === 'image'} fallback={<Show when={media().type === 'video' ? media() : undefined} keyed>{item => item.type === 'video' && <GalleryVideo media={item} />}</Show>}>
            <Show when={media().type === 'image' ? media() : undefined} keyed>{item => item.type === 'image' && <img src={item.src} srcset={item.thumbnail ? `${item.thumbnail} 640w, ${item.src} ${item.width}w` : undefined} sizes="(max-width: 800px) 100vw, 52vw" alt={item.alt} width={item.width} height={item.height} loading="eager" decoding="async" fetchpriority={active() === 0 ? 'high' : 'auto'} />}</Show>
          </Show>
          <Show when={comingSoon}><span class="status-badge">Coming soon</span></Show>
          <span class="gallery-count" aria-live="polite">{String(active() + 1).padStart(2, '0')} / {String(product.gallery.length).padStart(2, '0')}</span>
        </div>
        <div class="gallery-thumbnails" aria-label="Product gallery"><For each={product.gallery}>{(item, index) => <button type="button" aria-label={`View ${thumbnailAlt(item)}`} aria-pressed={active() === index()} classList={{ 'thumbnail-active': active() === index() }} onClick={() => setActive(index())}><img src={item.type === 'image' ? item.thumbnail || item.src : item.poster} alt={thumbnailAlt(item)} width={item.type === 'image' ? item.width : item.posterWidth || 120} height={item.type === 'image' ? item.height : item.posterHeight || 120} loading="lazy" decoding="async" /><Show when={item.type === 'video'}><span class="thumbnail-play" aria-hidden="true">▶</span></Show></button>}</For></div>
        <Show when={product.galleryNote}><p class="gallery-note">{product.galleryNote}</p></Show>
        <Show when={captions.length}><div class="gallery-captions" aria-live="polite"><For each={captions}>{caption => <p class="gallery-note" classList={{ 'gallery-caption-active': active() === caption.index }} aria-hidden={active() !== caption.index}>{caption.text}</p>}</For></div></Show>
      </div>
      <div class="product-purchase">
        <p class="eyebrow">EITAWARE collection</p><h1 id="product-title">{product.name}</h1><p class="product-title-detail">{product.subtitle}</p>
        <Show when={!comingSoon && product.priceCents !== undefined}><p class="product-price">{money(product.priceCents!)} <span>USD</span></p></Show>
        <p class="body-copy product-description">{product.description}</p>
        <Show when={comingSoon} fallback={<>
          <Show when={product.color}><div class="color-selection"><span>Color <strong>{product.color}</strong></span><Show when={product.color === 'Dark Blue'}><span class="color-swatch" aria-label="Dark Blue" /></Show></div></Show>
          <Show when={product.pieces || product.serviceFor}><div class="product-pieces"><Show when={product.pieces}><span>{product.pieces} pieces</span></Show><Show when={product.serviceFor}><span>Service for {product.serviceFor}</span></Show></div></Show>
          <div class="buy-row"><PurchaseAction product={product} class="product-buy">Buy now — {storePrice(product.priceCents || 0)} <ArrowIcon /></PurchaseAction></div>
          <a class="purchase-guarantee" href={ARRIVES_PERFECT.href}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg><span>{ARRIVES_PERFECT.headline}</span></a>
          <Show when={product.id === DEFAULT_PRODUCT_ID || product.amazonUrl}><a class="button-secondary amazon-cta amazon-product" href={amazonUrl('productPage', product.amazonUrl)} target="_blank" rel="noopener">Shop on Amazon <ArrowIcon diagonal /></a></Show>
          <div class="purchase-note"><span>Secure payment</span><span>Free shipping</span></div>
        </>}>
          <div class="coming-soon-panel"><p class="eyebrow">On the horizon</p><h2>What to expect</h2><p>{product.whatToExpect}</p><Show when={product.expectedLaunch}><p class="launch-window">Expected: {product.expectedLaunch}</p></Show><p class="form-note">A preview of what’s next. Orders are not open yet.</p></div>
        </Show>
        <p class="product-shipping-note"><a href="/shipping-returns">Shipping &amp; returns</a><a href="/contact">A question? We’re here to help.</a></p>
        <div class="product-accordions">
          <Show when={product.contents.length}><details open><summary>What’s Included<span aria-hidden="true">+</span></summary><div><For each={product.contents}>{piece => <p class="contents-detail"><span>{piece.quantity} {piece.name.toLowerCase()}</span><span>{piece.size}</span></p>}</For></div></details></Show>
          <Show when={product.specifications.length || product.care.length || product.id === DEFAULT_PRODUCT_ID}><details><summary>Details &amp; Care<span aria-hidden="true">+</span></summary><div><For each={product.specifications}>{spec => <p><strong>{spec.label}:</strong> {spec.value}</p>}</For><Show when={product.id === DEFAULT_PRODUCT_ID}><p>Quality controlled</p></Show><For each={product.care}>{line => <p>{line}</p>}</For></div></details></Show>
          <details><summary>Delivery &amp; Support<span aria-hidden="true">+</span></summary><div><p>Free standard shipping to the lower 48 states and Washington, D.C. Orders are normally processed within 1–2 business days.</p><p>{ARRIVES_PERFECT.headline} <EmailText text={ARRIVES_PERFECT.text} /></p><p>{ARRIVES_PERFECT.qualification}</p><p>See our <a href="/shipping-returns">shipping &amp; returns policy</a>, or <a href="/contact">contact our team</a> for help.</p></div></details>
        </div>
      </div>
    </section>
    <Show when={!comingSoon}><section class="product-bottom-cta" data-reveal-group="" data-reveal-children=""><p class="eyebrow">The Everyday Set</p><h2>Set your table<br /><em>with confidence</em></h2><PurchaseAction product={product}>Buy now — {storePrice(product.priceCents || 0)} <ArrowIcon /></PurchaseAction><Show when={product.id === DEFAULT_PRODUCT_ID || product.amazonUrl}><a class="amazon-link" href={amazonUrl('productPageBottom', product.amazonUrl)} target="_blank" rel="noopener">Or shop on Amazon <ArrowIcon diagonal /></a></Show></section><div class="mobile-purchase-bar"><div><strong>{product.name}</strong><span>{storePrice(product.priceCents || 0)}</span></div><PurchaseAction product={product}>Buy now <ArrowIcon /></PurchaseAction></div></Show>
  </main>;
}
