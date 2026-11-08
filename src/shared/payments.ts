import { PRODUCT, findProduct, productPath, type CatalogProduct } from './catalog';

/** Only available products expose their catalog-configured public Payment Link. */
export function stripePaymentLink(product: CatalogProduct): string | undefined {
  return product.status === 'available' ? product.payments?.stripePaymentLink : undefined;
}

/** Old bookmarks resolve product identity, never a caller-supplied destination. */
export function checkoutDestination(productId?: string): string {
  const product = productId === undefined ? PRODUCT : findProduct(productId);
  if (!product || product.status === 'draft') return '/products';
  return stripePaymentLink(product) || productPath(product);
}
