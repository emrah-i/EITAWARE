import { describe, expect, it } from 'vitest';
import catalogJson from '../src/content/catalog.json';
import { parseCatalog } from '../src/shared/catalog-schema';

// Independent merchandising fixtures let these tests protect the catalog
// contract even when the real collection's copy, prices, and order change.
const image = (overrides: Record<string, unknown> = {}) => ({
  type: 'image', src: '/images/product-set.webp', thumbnail: '/images/product-set-640.webp',
  width: 1251, height: 848, alt: 'A complete dinnerware set', label: 'The complete set', ...overrides,
});
const video = (overrides: Record<string, unknown> = {}) => ({
  type: 'video', src: '/videos/table.mp4', poster: '/images/video-table.webp',
  label: 'A table set for dinner', caption: 'See the finish in motion.', ...overrides,
});
const product = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'blue-table-set', slug: 'a-place-at-the-table', status: 'available',
  name: 'The Table Set', title: 'Blue Dinnerware', subtitle: 'Dinnerware for four',
  description: 'A complete stoneware dinnerware set.', image: '/images/product-set.webp',
  priceCents: 7999, currency: 'usd', payments: { stripePaymentLink: 'https://buy.stripe.com/test_blue' },
  gallery: [image(), video()],
  contents: [{ name: 'Dinner plates', quantity: 4, size: '10 inches', caption: 'For dinner.' }],
  specifications: [{ label: 'Material', value: 'Stoneware' }],
  care: ['Dishwasher safe.'], ...overrides,
});
const catalog = (...products: Record<string, unknown>[]) => ({
  featuredProductId: 'blue-table-set', products: products.length ? products : [product()],
});
const rejects = (input: unknown) => expect(() => parseCatalog(input)).toThrow(/Invalid catalog:/);

describe('catalog publication contract', () => {
  it('retains valid optional video poster dimensions for layout reservation', () => {
    const result = parseCatalog(catalog(product({ gallery: [video({ posterWidth: 1280, posterHeight: 720 })] })));
    expect(result.products[0].gallery[0]).toMatchObject({ posterWidth: 1280, posterHeight: 720 });
  });
  it.each([{ posterWidth: 1280 }, { posterHeight: 720 }, { posterWidth: 0, posterHeight: 720 }, { posterWidth: 1280, posterHeight: -1 }])('rejects invalid poster dimensions %j', dimensions => {
    rejects(catalog(product({ gallery: [video(dimensions)] })));
  });

  it('accepts the actual source catalog before it reaches the storefront or Worker', () => {
    const result = parseCatalog(structuredClone(catalogJson));
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.find(item => item.id === result.featuredProductId)?.status).toBe('available');
  });

  it.each([null, [], 'catalog', {}, { featuredProductId: 'blue-table-set', products: [] }, catalog(null as unknown as Record<string, unknown>)])('rejects a malformed catalog instead of producing a partial storefront', input => {
    rejects(input);
  });

  it.each(['id', 'slug'])('rejects an absent %s rather than creating an unaddressable product', field => {
    const item = product();
    delete item[field];
    rejects(catalog(item));
  });

  it.each(['', '   ', 'Dark Blue', 'UPPERCASE', '../private', 'nested/route', 'set?preview=1', 'set#details', '-set', 'set-', 'set--blue', 123, null])('rejects malformed product identifiers and route slugs: %s', value => {
    rejects(catalog(product({ id: value })));
    rejects(catalog(product({ slug: value })));
  });

  it('rejects duplicate product identities even when the public slugs differ', () => {
    rejects(catalog(product(), product({ slug: 'another-public-route' })));
  });

  it('rejects duplicate public routes even when the product identities differ', () => {
    rejects(catalog(product(), product({ id: 'another-product' })));
  });

  it.each([undefined, null, '7999', 79.99, 0, -7999, Infinity])('requires an explicit valid charge amount for an available product: %s', priceCents => {
    rejects(catalog(product({ priceCents })));
  });

  it('permits a genuinely unpriced preview while requiring useful expectations', () => {
    const preview = product({
      id: 'future-set', slug: 'a-new-finish', status: 'coming-soon', priceCents: undefined,
      whatToExpect: 'The same everyday shapes in a new warm finish.', expectedLaunch: 'Spring 2027',
    });
    const result = parseCatalog(catalog(product(), preview));
    expect(result.products[1]).toMatchObject({ status: 'coming-soon', whatToExpect: preview.whatToExpect, expectedLaunch: 'Spring 2027' });
    expect(result.products[1].priceCents).toBeUndefined();
  });

  it.each([undefined, '', '   ', null])('rejects a coming-soon page with no meaningful what-to-expect text: %s', whatToExpect => {
    rejects(catalog(product(), product({ id: 'future-set', slug: 'future-set', status: 'coming-soon', priceCents: undefined, whatToExpect })));
  });

  it.each(['draft', 'coming-soon'])('refuses to feature a %s product on the purchase-led homepage', status => {
    rejects(catalog(product({ status, whatToExpect: 'A new finish is on its way.' })));
  });

  it('refuses a featured product that does not exist', () => {
    rejects({ ...catalog(), featuredProductId: 'missing-set' });
  });

  it('preserves editorial product order and mixed image/video gallery order without changing authored metadata', () => {
    const media = [
      video({ label: 'Start with the table' }),
      image({ src: '/images/detail-lava-cake.webp', thumbnail: undefined, alt: 'The blue glaze up close', label: 'The glaze' }),
      video({ src: '/videos/meal.mp4', poster: '/images/video-meal.webp', label: 'Then the meal', caption: undefined }),
      image({ label: 'The full set, last' }),
    ];
    const input = catalog(
      product({ id: 'future-set', slug: 'future-set', status: 'coming-soon', priceCents: undefined, whatToExpect: 'A new finish.' }),
      product({ gallery: media }),
      product({ id: 'draft-set', slug: 'draft-set', status: 'draft', priceCents: undefined }),
    );
    const before = structuredClone(input);
    const result = parseCatalog(input);
    expect(result.products.map(item => item.id)).toEqual(['future-set', 'blue-table-set', 'draft-set']);
    expect(result.products[1].gallery.map(item => [item.type, item.label, item.src])).toEqual([
      ['video', 'Start with the table', '/videos/table.mp4'],
      ['image', 'The glaze', '/images/detail-lava-cake.webp'],
      ['video', 'Then the meal', '/videos/meal.mp4'],
      ['image', 'The full set, last', '/images/product-set.webp'],
    ]);
    expect(result.products[1]).toMatchObject({ contents: before.products[1].contents });
    expect(input).toEqual(before);
  });
});

describe('catalog media usable by browser elements', () => {
  it.each([undefined, [], [null], [image({ type: 'audio' })]])('rejects an absent or unusable gallery', gallery => {
    rejects(catalog(product({ gallery })));
  });

  it.each(['https://example.com/photo.webp', 'images/product-set.webp', '/images/../secret.webp', '/images//product-set.webp', 'data:image/png;base64,AAAA'])('rejects external, relative, or escaping media sources: %s', src => {
    rejects(catalog(product({ image: src })));
    rejects(catalog(product({ gallery: [image({ src })] })));
    rejects(catalog(product({ gallery: [video({ src })] })));
  });

  it.each([
    image({ alt: '' }), image({ alt: '   ' }), image({ width: 0 }), image({ height: -1 }),
    image({ width: 1251.5 }), image({ height: '848' }), image({ label: '' }),
    image({ thumbnail: 'https://example.com/thumbnail.webp' }),
  ])('rejects image media that cannot provide accessible, stable gallery content', item => {
    rejects(catalog(product({ gallery: [item] })));
  });

  it.each([video({ poster: undefined }), video({ poster: '' }), video({ poster: 'https://example.com/poster.webp' }), video({ label: '' })])('requires a local video poster and a usable label', item => {
    rejects(catalog(product({ gallery: [item] })));
  });

  it.each([
    product({ image: '/videos/table.mp4' }),
    product({ gallery: [image({ src: '/videos/table.mp4' })] }),
    product({ gallery: [image({ thumbnail: '/videos/table.mp4' })] }),
    product({ gallery: [video({ src: '/images/product-set.webp' })] }),
    product({ gallery: [video({ poster: '/videos/table.mp4' })] }),
  ])('rejects files whose media type does not match the browser element that will render them', item => {
    rejects(catalog(item));
  });
});


describe('product payment and stock configuration', () => {
  it('keeps the Dark Blue set available with its product Payment Link', () => {
    const current = parseCatalog(catalogJson).products.find(item => item.id === 'eitaware-dark-blue-12');
    expect(current?.status).toBe('available');
    expect(current?.payments?.stripePaymentLink).toMatch(/^https:\/\/buy\.stripe\.com\//);
  });
  it('retains distinct payment destinations for different products', () => {
    const result = parseCatalog(catalog(product(), product({ id: 'green-set', slug: 'green-set', payments: { stripePaymentLink: 'https://buy.stripe.com/test_green' } })));
    expect(result.products.map(item => item.payments?.stripePaymentLink)).toEqual(['https://buy.stripe.com/test_blue', 'https://buy.stripe.com/test_green']);
  });
  it.each([undefined, {}, { stripePaymentLink: undefined }])('requires a link for available products: %j', payments => {
    rejects(catalog(product({ payments })));
  });
  it.each([null, [], 'https://buy.stripe.com/test_blue'])('rejects malformed payment sections: %j', payments => {
    rejects(catalog(product({ payments })));
  });
  it.each(['', '   ', 123, null, 'not-a-url', '/checkout', 'http://buy.stripe.com/test_blue', 'https://example.com/test_blue', 'https://buy.stripe.com.example.com/test_blue', 'https://user:password@buy.stripe.com/test_blue', 'https://buy.stripe.com:444/test_blue', ' https://buy.stripe.com/test_blue '])('rejects invalid Payment Link %s for every status', stripePaymentLink => {
    for (const status of ['available', 'sold-out', 'coming-soon', 'draft']) {
      rejects(catalog(product({ status, whatToExpect: 'A preview.', payments: { stripePaymentLink } })));
    }
  });
  it.each(['sold-out', 'coming-soon', 'draft'])('allows %s products to omit their link', status => {
    const item = product({ id: 'inactive-set', slug: 'inactive-set', status, whatToExpect: 'A preview.', payments: undefined });
    expect(parseCatalog(catalog(product(), item)).products[1].payments).toBeUndefined();
  });
  it('allows a sold-out featured product and preserves its price and payment configuration', () => {
    const result = parseCatalog(catalog(product({ status: 'sold-out' })));
    expect(result.products[0]).toMatchObject({ status: 'sold-out', priceCents: 7999, payments: { stripePaymentLink: 'https://buy.stripe.com/test_blue' } });
  });
  it('allows a sold-out featured product without a payment link', () => {
    expect(parseCatalog(catalog(product({ status: 'sold-out', payments: undefined }))).products[0].status).toBe('sold-out');
  });
  it.each([undefined, null, '7999', 0, -1])('requires a valid sold-out price: %s', priceCents => {
    rejects(catalog(product({ status: 'sold-out', priceCents })));
  });
});
