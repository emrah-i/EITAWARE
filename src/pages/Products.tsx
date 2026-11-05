import { For } from 'solid-js';
import { PUBLISHED_PRODUCTS } from '../shared/catalog';
import ProductCard from '../components/ProductCard';

export default function Products() {
  return <main id="main-content" tabIndex={-1} class="catalog-page">
    <div class="catalog-heading section-shell"><p class="eyebrow">The EITAWARE collection</p><h1 class="page-title">For your table.<br /><em>For every day.</em></h1><p class="page-intro">Thoughtful pieces for the meals, moments, and people that make a home.</p></div>
    <section class="catalog-grid section-shell" aria-label="Our products"><For each={PUBLISHED_PRODUCTS}>{product => <ProductCard product={product} />}</For></section>
    <div class="catalog-help"><p>A question before you set the table?</p><a class="text-link" href="/contact">We’re here to help <span aria-hidden="true">→</span></a></div>
  </main>;
}
