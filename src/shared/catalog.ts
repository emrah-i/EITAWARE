import catalogJson from '../content/catalog.json';
import { parseCatalog } from './catalog-schema';
export type { CatalogProduct, CatalogMedia, ImageMedia, VideoMedia } from './catalog-schema';

export const CATALOG = parseCatalog(catalogJson);
export const PUBLISHED_PRODUCTS = CATALOG.products.filter(product => product.status !== 'draft');
export const PRODUCT = CATALOG.products.find(product => product.id === CATALOG.featuredProductId)!;
export const DEFAULT_PRODUCT_ID = 'eitaware-dark-blue-12';
export const findProduct = (id: string) => CATALOG.products.find(product => product.id === id);
export const findPublishedProduct = (slug: string) => PUBLISHED_PRODUCTS.find(product => product.slug === slug);
export const productPath = (product: { slug: string }) => `/products/${product.slug}`;

export const BRAND = {
  name: 'EITAWARE', legalName: 'M Sqware LLC', state: 'Maryland',
  slogan: 'Simple elegance, beautifully served',
  url: 'https://eitaware.com', supportEmail: 'support@eitaware.com', ordersEmail: 'orders@eitaware.com',
} as const;

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** Marketing prices omit .00; money() retains two decimal places. */
export function storePrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
