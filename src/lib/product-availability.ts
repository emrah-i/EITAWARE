import type { CatalogProduct } from '../shared/catalog';
import type { ProductResponse } from '../shared/types';

/** Fail closed if a cached page no longer matches the server's offer. */
export async function productAvailability(product: CatalogProduct, signal: AbortSignal): Promise<ProductResponse> {
  const response = await fetch(`/api/product?id=${encodeURIComponent(product.id)}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Availability could not be confirmed');
  const current = await response.json() as ProductResponse;
  if (current.id !== product.id || current.priceCents !== product.priceCents || current.currency !== product.currency || current.maxQuantity !== product.maxQuantity || current.status !== 'available' || typeof current.available !== 'boolean' || !['test', 'live', 'unavailable'].includes(current.checkoutMode) || (current.available && current.checkoutMode === 'unavailable')) {
    throw new Error('Product changed');
  }
  return current;
}
