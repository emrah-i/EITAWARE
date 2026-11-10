import EmailText from '../components/EmailText';
import { For, Show } from 'solid-js';
import { BRAND, storePrice, PRODUCT, PUBLISHED_PRODUCTS, productPath } from '../shared/catalog';
import { amazonUrl } from '../shared/amazon';
import PurchaseAction from '../components/PurchaseAction';
import { ARRIVES_PERFECT } from '../shared/guarantee';
import ProductCard from '../components/ProductCard';
import { ArrowIcon, CareIcon } from '../components/Icon';

export default function Home() {
  const cover = PRODUCT.gallery.find(media => media.type === 'image' && media.src === PRODUCT.image);
  const coverImage = cover?.type === 'image' ? cover : undefined;
  return <main id="main-content" tabIndex={-1}>
    <section class="home-hero" data-reveal-group="" data-reveal-children="">
      <div class="hero-copy"><p class="eyebrow">{BRAND.slogan}</p><h1>An effortlessly<br /><em>elegant table</em></h1><p class="hero-description">Stoneware in a dark blue reactive glaze, with subtle variation in every piece. Twelve pieces for four, safe for the dishwasher and microwave.</p><a class="button" href="/products">Shop dinnerware <ArrowIcon /></a><div class="hero-caption"><span>12 pieces</span><span>Service for four</span><span>Dark Blue</span></div></div>
      <div class="hero-image-wrap"><img class="hero-image" src="/images/table-setting.webp" srcset="/images/table-setting-640.webp 640w, /images/table-setting.webp 1254w" sizes="(max-width: 600px) 100vw, 57vw" alt="A welcoming table set for four with EITAWARE Dark Blue dinner plates, salad plates, and bowls" width="1254" height="1254" loading="eager" decoding="async" fetchpriority="high" /><div class="image-index"><span>THE EVERYDAY SET</span></div></div>
    </section>

    <div class="surface-white">

    <section class="featured-set section-shell" data-reveal-group="" aria-labelledby="featured-title"><div class="featured-image"><img src={PRODUCT.image} srcset={coverImage?.thumbnail ? `${coverImage.thumbnail} 640w, ${PRODUCT.image} ${coverImage.width}w` : undefined} sizes="(max-width: 600px) 100vw, 55vw" alt={coverImage?.alt || PRODUCT.name} width={coverImage?.width} height={coverImage?.height} loading="lazy" decoding="async" /><span class="product-image-caption">{PRODUCT.subtitle}</span></div><div class="featured-copy"><p class="eyebrow">The collection</p><h2 id="featured-title">A beautiful table<br /><em>starts here</em></h2><p class="body-copy">{PRODUCT.description}</p><div class="featured-price"><span>{PRODUCT.name}</span><span>{storePrice(PRODUCT.priceCents!)}</span></div><p class="product-subline">{PRODUCT.subtitle}</p><PurchaseAction product={PRODUCT}>Buy now <ArrowIcon /></PurchaseAction></div></section>

    </div>

    <div class="home-bands">
    <Show when={PRODUCT.careHighlights?.length}><section class="care-strip" data-reveal-group="" data-reveal-children="" aria-label="Made for everyday use"><For each={PRODUCT.careHighlights}>{highlight => <div><CareIcon kind={highlight.kind} /><span>{highlight.label}</span></div>}</For></section></Show>

    <Show when={PUBLISHED_PRODUCTS.some(product => product.status === 'coming-soon')}><section class="coming-next"><div class="section-shell"><div class="section-heading-row" data-reveal-group=""><div><p class="eyebrow">Future additions</p><h2>Coming <em>next</em></h2></div><a class="text-link" href="/products">Shop dinnerware <ArrowIcon /></a></div><div class="catalog-grid"><For each={PUBLISHED_PRODUCTS.filter(product => product.status === 'coming-soon').slice(0, 3)}>{product => <ProductCard product={product} />}</For></div></div></section></Show>

    <section class="ritual-section" data-reveal-group="" data-reveal-children="" aria-labelledby="ritual-title"><div class="ritual-image"><img src="/images/dining.webp" srcset="/images/dining-640.webp 640w, /images/dining.webp 1024w" sizes="(max-width: 600px) 100vw, 57vw" alt="Salmon, salad, and fresh fruit served on Dark Blue EITAWARE dinnerware" width="1024" height="694" loading="lazy" decoding="async" /></div><div class="ritual-copy"><p class="eyebrow">For hosting and everyday use</p><h2 id="ritual-title">Every meal<br /><em>beautifully served</em></h2><p class="body-copy">The quick lunches. The slow Sundays. The dinners that turn into conversations. A favorite set makes each one feel a little more like home.</p><a class="text-link" href={productPath(PRODUCT)}>See the details <ArrowIcon /></a></div></section>

    <Show when={PRODUCT.contents.length}><div><section class="included-section section-shell" data-reveal-group="" aria-labelledby="included-title"><div class="included-heading"><p class="eyebrow">{PRODUCT.pieces === 12 && PRODUCT.serviceFor === 4 ? 'Twelve pieces, Service for four' : [PRODUCT.pieces ? `${PRODUCT.pieces} pieces` : '', PRODUCT.serviceFor ? `Service for ${PRODUCT.serviceFor}` : ''].filter(Boolean).join(', ') || 'Considered details'}</p><h2 id="included-title">A complete setting<br /><em>{PRODUCT.serviceFor === 4 ? 'for four' : PRODUCT.serviceFor ? `for ${PRODUCT.serviceFor}` : 'for your table'}</em></h2></div><div class="included-list"><For each={PRODUCT.contents}>{(piece, index) => <div class="included-row"><span class="included-index">0{index() + 1}</span><div><h3>{piece.quantity} {piece.name.toLowerCase()}</h3><p>{piece.caption}</p></div><span class="included-size">{piece.size}</span></div>}</For><a class="text-link" href={productPath(PRODUCT)}>Take a closer look <ArrowIcon /></a></div></section></div></Show>

    <div><section class="home-faq section-shell" data-reveal-group="" aria-labelledby="faq-title"><div><p class="eyebrow">Before you order</p><h2 id="faq-title">Your questions<br /><em>answered</em></h2><a class="text-link" href="/faq">Read our FAQ <ArrowIcon /></a></div><div class="product-accordions"><details><summary>What’s included?<span aria-hidden="true">+</span></summary><div><p>See each set’s product page for its included pieces, dimensions, and service size. Browse our <a href="/products">dinnerware collection</a> to find your set.</p></div></details><details><summary>How should I care for it?<span aria-hidden="true">+</span></summary><div><p>Check the Details &amp; Care section on your set’s product page for care instructions.</p></div></details><details><summary>Where do you ship?<span aria-hidden="true">+</span></summary><div><p>We offer free standard shipping to the lower 48 states and Washington, D.C. Orders are normally processed within 1–2 business days. See our <a href="/shipping-returns">shipping &amp; returns policy</a> for details.</p></div></details><details><summary>What if something arrives broken?<span aria-hidden="true">+</span></summary><div><p><EmailText text={ARRIVES_PERFECT.text} /></p><p>{ARRIVES_PERFECT.qualification} Read our <a href={ARRIVES_PERFECT.href}>arrives perfect guarantee</a>.</p></div></details></div></section></div>

    <section class="home-closing" data-reveal-group="" data-reveal-children=""><img src="/images/overhead.webp" srcset="/images/overhead-640.webp 640w, /images/overhead.webp 1254w" sizes="(max-width: 600px) 100vw, 44vw" alt="Fresh pasta, salad, and breakfast served in EITAWARE Dark Blue stoneware" width="1254" height="1254" loading="lazy" decoding="async" /><div class="closing-copy"><p class="eyebrow">The finishing touch</p><h2>Bring understated<br /><em>elegance home</em></h2><div class="closing-actions"><a class="button" href="/products">Shop dinnerware <ArrowIcon /></a><a class="amazon-link" href={amazonUrl('homepageBottom')} target="_blank" rel="noopener">Shop on Amazon <ArrowIcon diagonal /></a></div></div></section>
    </div>
  </main>;
}
