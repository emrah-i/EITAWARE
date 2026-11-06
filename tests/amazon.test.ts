import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  AMAZON_URL, AMAZON_PLACEMENTS, AMAZON_PLACEMENT_URLS, amazonUrl,
  type AmazonPlacement,
} from '../src/shared/amazon';

const originalOverrides = { ...AMAZON_PLACEMENT_URLS };
const placements = [
  'header', 'homepageHero', 'homepageFeatured', 'homepageFaq', 'homepageBottom',
  'productPage', 'productPageBottom', 'footer', 'contactPage', 'checkoutFallback',
] as const;

function clearOverrides(): void {
  for (const placement of AMAZON_PLACEMENTS) delete AMAZON_PLACEMENT_URLS[placement];
}

describe('Amazon placement links', () => {
  beforeEach(clearOverrides);
  afterEach(() => { clearOverrides(); Object.assign(AMAZON_PLACEMENT_URLS, originalOverrides); });

  it('keeps all ten named placements typed against the optional override map', () => {
    expect(AMAZON_PLACEMENTS).toEqual(placements);
    expect(new Set(AMAZON_PLACEMENTS).size).toBe(10);
    expectTypeOf<AmazonPlacement>().toEqualTypeOf<typeof placements[number]>();
    expectTypeOf(AMAZON_PLACEMENT_URLS).toEqualTypeOf<Partial<Record<AmazonPlacement, string>>>();
    expectTypeOf(amazonUrl).parameter(0).toEqualTypeOf<AmazonPlacement>();
  });

  it.each(placements)('preserves the exact supplied attribution URL and parameter order for %s', (placement) => {
    expect(AMAZON_URL).toBe('https://www.amazon.com/dp/B0H8X1MSP5?maas=maas_adg_24A2C9F4135E9FCE114E5166E9516EB1_afap_abs&ref_=aa_maas&tag=maas');
    expect(amazonUrl(placement)).toBe(AMAZON_URL);
    expect([...new URL(amazonUrl(placement)).searchParams.entries()]).toEqual([
      ['maas', 'maas_adg_24A2C9F4135E9FCE114E5166E9516EB1_afap_abs'],
      ['ref_', 'aa_maas'],
      ['tag', 'maas'],
    ]);
  });

  it.each(['', '   ', '\t\n'])('falls back to the main URL for an empty override', (value) => {
    AMAZON_PLACEMENT_URLS.homepageHero = value;
    expect(amazonUrl('homepageHero')).toBe(AMAZON_URL);
  });

  it.each(['amazon.com', 'www.amazon.com'])('preserves the exact attribution query string on %s', (host) => {
    const url = `${AMAZON_URL.replace('www.amazon.com', host)}&test_tag=table%2Bware&test_ref=homepage+hero&ascsubtag=%7e%2f&source=one&source=two#details`;
    AMAZON_PLACEMENT_URLS.homepageHero = url;
    expect(amazonUrl('homepageHero')).toBe(url);
  });

  it('keeps placement overrides isolated from the main URL and other placements', () => {
    const hero = `${AMAZON_URL}&ref_=hero&source=homepage`;
    const footer = `${AMAZON_URL}&ref_=footer&source=sitewide`;
    AMAZON_PLACEMENT_URLS.homepageHero = hero;
    AMAZON_PLACEMENT_URLS.footer = footer;
    expect(amazonUrl('homepageHero')).toBe(hero);
    expect(amazonUrl('footer')).toBe(footer);
    for (const placement of placements.filter(value => value !== 'homepageHero' && value !== 'footer')) {
      expect(amazonUrl(placement)).toBe(AMAZON_URL);
    }
    delete AMAZON_PLACEMENT_URLS.homepageHero;
    expect(amazonUrl('homepageHero')).toBe(AMAZON_URL);
    expect(amazonUrl('footer')).toBe(footer);
  });

  it('preserves a future product URL fallback while giving placement overrides priority', () => {
    const product = `${AMAZON_URL.replace('B0H8X1MSP5', 'FUTURE_PRODUCT')}&test_placement=product`;
    expect(amazonUrl('productPage', product)).toBe(product);
    AMAZON_PLACEMENT_URLS.productPage = `${AMAZON_URL}&ref_=placement`;
    expect(amazonUrl('productPage', product)).toBe(AMAZON_PLACEMENT_URLS.productPage);
    expect(amazonUrl('header')).toBe(AMAZON_URL);
  });

  it.each([
    AMAZON_URL.replace('https:', 'http:'),
    AMAZON_URL.replace('www.amazon.com', 'amazon.com.evil.example'),
    AMAZON_URL.replace('www.amazon.com', 'shop.amazon.com'),
    AMAZON_URL.replace('www.amazon.com', 'example.com'),
    AMAZON_URL.replace('https://', 'https://user:password@'),
    'javascript:alert(1)', 'not a URL',
  ])('rejects an unsafe or unsupported placement URL: %s', (url) => {
    AMAZON_PLACEMENT_URLS.productPage = url;
    expect(() => amazonUrl('productPage')).toThrow();
    expect(amazonUrl('header')).toBe(AMAZON_URL);
  });
});
