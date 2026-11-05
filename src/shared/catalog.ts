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
  url: 'https://eitaware.com', supportEmail: 'support@eitaware.com', ordersEmail: 'orders@eitaware.com',
  amazonUrl: 'https://www.amazon.com/dp/B0H8X1MSP5',
} as const;

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export const SHIPPING_STATES = [
  'AL','AZ','AR','CA','CO','CT','DE','DC','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA',
  'MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const;

export const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'Washington, D.C.',
  FL:'Florida',GA:'Georgia',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
  ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};
