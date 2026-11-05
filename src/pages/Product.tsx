import { createSignal, For, Show } from 'solid-js';
import { money, type CatalogProduct } from '../shared/catalog';
import { ArrowIcon } from '../components/Icon';

export default function Product(props: { product: CatalogProduct }) {
  const product = props.product;
  const [active, setActive] = createSignal(0);
  const [quantity, setQuantity] = createSignal(1);
  const media = () => product.gallery[active()];
  const checkout = () => `/checkout?product=${encodeURIComponent(product.id)}&quantity=${quantity()}`;
  const comingSoon = product.status === 'coming-soon';
  return <main id="main-content" tabIndex={-1}>
    <div class="product-breadcrumb section-shell"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/products">Collection</a><span aria-hidden="true">/</span><span>{product.name}</span></div>
    <section class="product-layout section-shell" aria-labelledby="product-title">
      <div class="product-gallery">
        <div class="gallery-main" aria-label="Selected product media">
          <Show when={media().type === 'image'} fallback={<Show when={media().type === 'video' ? media() : undefined} keyed>{item => item.type === 'video' && <video controls preload="none" poster={item.poster} aria-label={item.label}><source src={item.src} type="video/mp4" /><a href={item.src}>Open the product video</a></video>}</Show>}>
            <Show when={media().type === 'image' ? media() : undefined} keyed>{item => item.type === 'image' && <img src={item.src} srcset={item.thumbnail ? `${item.thumbnail} 640w, ${item.src} ${item.width}w` : undefined} sizes="(max-width: 800px) 100vw, 52vw" alt={item.alt} width={item.width} height={item.height} fetchpriority="high" />}</Show>
          </Show>
          <Show when={comingSoon}><span class="status-badge">Coming soon</span></Show>
          <span class="gallery-count" aria-live="polite">{String(active() + 1).padStart(2, '0')} / {String(product.gallery.length).padStart(2, '0')}</span>
        </div>
        <div class="gallery-thumbnails" aria-label="Product gallery"><For each={product.gallery}>{(item, index) => <button type="button" aria-label={`View ${item.label.toLowerCase()}${item.type === 'video' ? ' video' : ''}`} aria-pressed={active() === index()} classList={{ 'thumbnail-active': active() === index() }} onClick={() => setActive(index())}><img src={item.type === 'image' ? item.thumbnail || item.src : item.poster} alt="" width="120" height="120" loading="lazy" /><Show when={item.type === 'video'}><span class="thumbnail-play" aria-hidden="true">▶</span></Show></button>}</For></div>
        <Show when={product.galleryNote}><p class="gallery-note">{product.galleryNote}</p></Show>
        <Show when={media().type === 'video'}><p class="gallery-note">{media().type === 'video' && (media() as { caption?: string }).caption}</p></Show>
      </div>
      <div class="product-purchase">
        <p class="eyebrow">EITAWARE · The collection</p><h1 id="product-title">{product.name}</h1><p class="product-title-detail">{product.subtitle}</p>
        <Show when={!comingSoon && product.priceCents !== undefined}><p class="product-price">{money(product.priceCents!)} <span>USD</span></p></Show>
        <p class="body-copy product-description">{product.description}</p>
        <Show when={comingSoon} fallback={<>
          <Show when={product.color}><div class="color-selection"><span>Color <strong>{product.color}</strong></span><Show when={product.color === 'Dark Blue'}><span class="color-swatch" aria-label="Dark blue" /></Show></div></Show>
          <Show when={product.pieces || product.serviceFor}><div class="product-pieces"><Show when={product.pieces}><span>{product.pieces} pieces</span></Show><Show when={product.serviceFor}><span>Service for {product.serviceFor}</span></Show></div></Show>
          <div class="quantity-label-row"><label for="product-quantity">Quantity</label><span>{product.quantityLabel}</span></div>
          <div class="buy-row"><div class="quantity-control"><button aria-label="Decrease quantity" disabled={quantity() === 1} onClick={() => setQuantity(Math.max(1, quantity() - 1))}>−</button><input id="product-quantity" name="quantity" aria-label={`Number of ${product.quantityLabel.toLowerCase()}`} type="number" min="1" max={product.maxQuantity} value={quantity()} onChange={event => { const next = Number(event.currentTarget.value); setQuantity(Number.isFinite(next) ? Math.min(product.maxQuantity, Math.max(1, Math.trunc(next))) : 1); }} /><button aria-label="Increase quantity" disabled={quantity() === product.maxQuantity} onClick={() => setQuantity(Math.min(product.maxQuantity, quantity() + 1))}>+</button></div><a class="button product-buy" href={checkout()}>Make it yours <ArrowIcon /></a></div>
          <Show when={product.amazonUrl}><a class="button-secondary amazon-product" href={product.amazonUrl} target="_blank" rel="noopener noreferrer">Shop on Amazon <ArrowIcon diagonal /></a></Show>
          <div class="purchase-note"><span>Secure payment</span><span>Complimentary shipping</span></div>
        </>}>
          <div class="coming-soon-panel"><p class="eyebrow">On the horizon</p><h2>What to expect.</h2><p>{product.whatToExpect}</p><Show when={product.expectedLaunch}><p class="launch-window">Expected: {product.expectedLaunch}</p></Show><p class="form-note">A preview of what’s next. Orders are not open yet.</p></div>
        </Show>
        <p class="product-shipping-note"><a href="/shipping-returns">Shipping &amp; returns</a><a href="/contact">A question? We’re here to help.</a></p>
        <div class="product-accordions">
          <Show when={product.contents.length}><details open><summary>What’s included<span aria-hidden="true">+</span></summary><div><For each={product.contents}>{piece => <p class="contents-detail"><span>{piece.quantity} {piece.name.toLowerCase()}</span><span>{piece.size}</span></p>}</For></div></details></Show>
          <Show when={product.specifications.length || product.care.length}><details><summary>Details &amp; care<span aria-hidden="true">+</span></summary><div><For each={product.specifications}>{spec => <p><strong>{spec.label}:</strong> {spec.value}</p>}</For><For each={product.care}>{line => <p>{line}</p>}</For></div></details></Show>
          <details><summary>Delivery &amp; support<span aria-hidden="true">+</span></summary><div><p>Complimentary standard shipping to the lower 48 states and Washington, D.C. Orders are normally processed within 1–2 business days.</p><p>See our <a href="/shipping-returns">shipping &amp; returns policy</a>, or <a href="/contact">contact our team</a> for help.</p></div></details>
        </div>
      </div>
    </section>
    <Show when={!comingSoon}><section class="product-bottom-cta"><p class="eyebrow">Your next favorite ritual.</p><h2>There’s a place <em>for you.</em></h2><a class="button" href={checkout()}>Make it yours — {money((product.priceCents || 0) * quantity())} <ArrowIcon /></a><Show when={product.amazonUrl}><a class="text-link" href={product.amazonUrl} target="_blank" rel="noopener noreferrer">Or shop on Amazon <ArrowIcon diagonal /></a></Show></section><div class="mobile-purchase-bar"><div><strong>{product.name}</strong><span>{money(product.priceCents || 0)}</span></div><a class="button" href={checkout()}>Make it yours <ArrowIcon /></a></div></Show>
  </main>;
}
