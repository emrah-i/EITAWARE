/** Paste the main Amazon Attribution URL here to update every default placement. */
export const AMAZON_URL = 'https://www.amazon.com/dp/B0H8X1MSP5?maas=maas_adg_24A2C9F4135E9FCE114E5166E9516EB1_afap_abs&ref_=aa_maas&tag=maas';

export const AMAZON_PLACEMENTS = [
  'header', 'homepageHero', 'homepageFeatured', 'homepageFaq', 'homepageBottom',
  'productPage', 'productPageBottom', 'footer', 'contactPage', 'checkoutFallback',
] as const;
export type AmazonPlacement = typeof AMAZON_PLACEMENTS[number];

/** Optional placement-specific Attribution URLs. Omitted or empty values use AMAZON_URL. */
export const AMAZON_PLACEMENT_URLS: Partial<Record<AmazonPlacement, string>> = {};

export function amazonUrl(placement: AmazonPlacement, productUrl?: string): string {
  const value = AMAZON_PLACEMENT_URLS[placement]?.trim() || productUrl?.trim() || AMAZON_URL;
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['amazon.com', 'www.amazon.com'].includes(url.hostname) || url.username || url.password) {
    throw new Error(`Invalid Amazon URL for ${placement}: use an HTTPS amazon.com URL.`);
  }
  // Return the original string so attribution query parameters are not rewritten.
  return value;
}
