import { Show } from 'solid-js';
import { money, productPath, type CatalogProduct } from '../shared/catalog';
import { ArrowIcon } from './Icon';

export default function ProductCard(props: { product: CatalogProduct }) {
  const product = props.product;
  return <article class="catalog-card">
    <a class="catalog-card-image" href={productPath(product)} aria-label={`Discover ${product.name}`}>
      <img src={product.image} alt={product.name} loading="lazy" width="900" height="900" />
      <Show when={product.status === 'coming-soon'}><span class="status-badge">Coming soon</span></Show>
      <span class="card-arrow" aria-hidden="true"><ArrowIcon /></span>
    </a>
    <div class="catalog-card-title"><h2><a href={productPath(product)}>{product.name}</a></h2><Show when={product.status === 'available' && product.priceCents !== undefined}><span>{money(product.priceCents!)}</span></Show></div>
    <p>{product.subtitle}</p>
    <Show when={product.status === 'coming-soon'}><p class="catalog-launch">{product.expectedLaunch || 'Something to look forward to.'}</p></Show>
    <a class="text-link" href={productPath(product)}>{product.status === 'coming-soon' ? 'See what’s coming' : 'Discover the details'} <ArrowIcon /></a>
  </article>;
}
