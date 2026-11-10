import { Show } from 'solid-js';
import { storePrice, productPath, type CatalogProduct } from '../shared/catalog';
import { ArrowIcon } from './Icon';
import { productPhoto } from '../shared/media';
import PurchaseAction from './PurchaseAction';

export default function ProductCard(props: { product: CatalogProduct; priority?: boolean }) {
  const product = props.product;
  const photo = productPhoto(product);
  return <article class="catalog-card" data-reveal-group="">
    <a class="catalog-card-image" href={productPath(product)} aria-label={`Discover ${product.name}`}>
      <img {...photo} sizes="(max-width: 600px) calc(100vw - 44px), (max-width: 1100px) 45vw, 30vw" loading={props.priority ? 'eager' : 'lazy'} fetchpriority={props.priority ? 'high' : undefined} decoding="async" />
      <Show when={product.status === 'coming-soon'}><span class="status-badge">Coming soon</span></Show>
      <span class="card-arrow" aria-hidden="true"><ArrowIcon /></span>
    </a>
    <div class="catalog-card-title"><h2><a href={productPath(product)}>{product.name}</a></h2><Show when={(product.status === 'available' || product.status === 'sold-out') && product.priceCents !== undefined}><span>{storePrice(product.priceCents!)}</span></Show></div>
    <p>{product.subtitle}</p>
    <Show when={product.status === 'coming-soon'}><p class="catalog-launch">{product.expectedLaunch || 'Something to look forward to.'}</p></Show>
    <PurchaseAction product={product} class="catalog-buy">Buy now <ArrowIcon /></PurchaseAction>
    <a class="text-link" href={productPath(product)}>{product.status === 'coming-soon' ? 'See what’s coming' : 'Discover the details'} <ArrowIcon /></a>
  </article>;
}
