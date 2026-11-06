import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT } from '../src/shared/catalog';
import { productAvailability } from '../src/lib/product-availability';

const current = { id: PRODUCT.id, status: 'available', priceCents: 7999, currency: 'usd', maxQuantity: PRODUCT.maxQuantity, available: true, checkoutMode: 'test' };
afterEach(() => vi.unstubAllGlobals());
describe('client availability gate', () => {
  it.each([true, false])('uses authoritative availability=%s with an uncached request', async available => {
    const fetcher = vi.fn(async () => Response.json({ ...current, available, checkoutMode: available ? 'test' : 'unavailable' }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    expect((await productAvailability(PRODUCT, signal)).available).toBe(available);
    expect(fetcher).toHaveBeenCalledWith(`/api/product?id=${PRODUCT.id}`, { cache: 'no-store', signal });
  });
  it.each([{ priceCents: 9999 }, { currency: 'eur' }, { id: 'different' }, { status: 'coming-soon' }, { available: 'true' }, { maxQuantity: 0 }, { checkoutMode: 'unavailable' }, { checkoutMode: undefined }])('rejects incompatible or unsafe availability %j', async override => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...current, ...override })));
    await expect(productAvailability(PRODUCT, new AbortController().signal)).rejects.toThrow();
  });
  it.each(['http', 'network', 'abort'])('fails closed after a %s failure', async failure => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'http') return new Response('Unavailable', { status: 503 });
      throw failure === 'abort' ? new DOMException('Aborted', 'AbortError') : new TypeError('Network failure');
    }));
    await expect(productAvailability(PRODUCT, new AbortController().signal)).rejects.toThrow();
  });
});
