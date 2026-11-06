import { generateHydrationScript, renderToString } from 'solid-js/web';
import App from './App';
import { BRAND, CATALOG, PUBLISHED_PRODUCTS, findPublishedProduct, productPath } from './shared/catalog';

export { CATALOG };
export { AMAZON_PLACEMENTS, amazonUrl } from './shared/amazon';
export const routes = ['/', '/products', ...PUBLISHED_PRODUCTS.map(productPath), '/faq', '/contact', '/checkout', '/order-confirmation', '/shipping-returns', '/privacy', '/terms', '/404'];
const pages: Record<string, [string, string]> = {
  '/': [BRAND.slogan, 'Shop EITAWARE’s elegant 12-piece Dark Blue stoneware dinnerware set for four at $79.99, with free standard shipping to the lower 48 states and Washington, D.C.'],
  '/products': ['Products', 'Explore EITAWARE dinnerware. Thoughtful stoneware pieces for your everyday table.'],
  '/contact': ['Contact', 'Questions about your EITAWARE dinnerware or an order? Contact our team at support@eitaware.com.'],
  '/faq': ['FAQ', 'Find answers about EITAWARE stoneware food safety, dishwasher and microwave use, care, shipping, returns, and free replacement sets for broken arrivals.'],
  '/checkout': ['Checkout', 'Review your EITAWARE order and delivery address.'],
  '/order-confirmation': ['Order Confirmation', 'Your EITAWARE payment confirmation.'],
  '/shipping-returns': ['Shipping and Returns', 'Free standard shipping to the lower 48 states and Washington, D.C. Read our shipping and 30-day return policy.'],
  '/privacy': ['Privacy Policy', 'How EITAWARE and M Sqware LLC handle your information.'],
  '/terms': ['Terms of Service', 'Terms for shopping with EITAWARE, a brand of M Sqware LLC.'],
  '/404': ['Page Not Found', 'Find your way back to the EITAWARE table.'],
};
export function renderPage(path: string) {
  const product = path.startsWith('/products/') ? findPublishedProduct(path.slice('/products/'.length)) : undefined;
  const [pageName, description] = product ? [`${product.name}${product.status === 'coming-soon' ? ' (Coming soon)' : ''}`, product.description] : pages[path] || pages['/404'];
  const title = `${BRAND.name} | ${pageName}`;
  const noindex = ['/checkout', '/order-confirmation', '/404'].includes(path) || (!product && !pages[path]);
  const canonical = `${BRAND.url}${path === '/' ? '' : path}`;
  const structuredData = product ? {
    '@context': 'https://schema.org', '@type': 'Product', name: `${BRAND.name} ${product.title}`, description: product.description,
    image: [`${BRAND.url}${product.image}`], sku: product.id,
    brand: { '@type': 'Brand', name: BRAND.name }, color: product.color, material: product.material,
    ...(product.status === 'available' && product.priceCents !== undefined ? { offers: { '@type': 'Offer', url: canonical, priceCurrency: 'USD', price: (product.priceCents / 100).toFixed(2), itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: BRAND.legalName } } } : {}),
  } : path === '/products' ? {
    '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: PUBLISHED_PRODUCTS.map((item, index) => ({ '@type': 'ListItem', position: index + 1, url: `${BRAND.url}${productPath(item)}`, name: item.name })),
  } : path === '/' ? { '@context': 'https://schema.org', '@type': 'Organization', name: BRAND.name, legalName: BRAND.legalName, url: BRAND.url, logo: `${BRAND.url}/images/logo.png`, email: BRAND.supportEmail } : null;
  return {
    html: renderToString(() => <App path={path} />), hydration: generateHydrationScript(), title, description, canonical, noindex,
    image: `${BRAND.url}${product?.image || '/images/table-setting.webp'}`, type: product ? 'product' : 'website',
    structuredData: structuredData ? JSON.stringify(structuredData).replace(/</g, '\\u003c') : null,
  };
}
