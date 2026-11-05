export type ProductStatus = 'draft' | 'coming-soon' | 'available';
export interface ImageMedia {
  type: 'image'; src: string; thumbnail?: string; width: number; height: number; alt: string; label: string;
}
export interface VideoMedia {
  type: 'video'; src: string; poster: string; label: string; caption?: string;
}
export type CatalogMedia = ImageMedia | VideoMedia;
export interface CatalogProduct {
  id: string; slug: string; status: ProductStatus; name: string; title: string; subtitle: string; description: string;
  image: string; gallery: CatalogMedia[]; priceCents?: number; currency: 'usd'; maxQuantity: number;
  quantityLabel: string; expectedLaunch?: string; whatToExpect?: string; galleryNote?: string;
  asin?: string; amazonUrl?: string; color?: string; material?: string; pieces?: number; serviceFor?: number;
  contents: { name: string; quantity: number; size: string; caption: string }[];
  specifications: { label: string; value: string }[]; care: string[];
  careHighlights?: { kind: 'dishwasher' | 'microwave' | 'stack'; label: string }[];
}
export interface Catalog { featuredProductId: string; products: CatalogProduct[]; }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const localAsset = (value: unknown) => typeof value === 'string' && /^\/(?:images|videos)\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..') && !value.includes('//');
const localImage = (value: unknown) => localAsset(value) && typeof value === 'string' && /^\/images\/.+\.(?:webp|png|jpe?g|avif)$/i.test(value);
const localVideo = (value: unknown) => localAsset(value) && typeof value === 'string' && /^\/videos\/.+\.mp4$/i.test(value);

/** Shared by the storefront, Worker, prerender, and catalog regression tests. */
export function parseCatalog(input: unknown): Catalog {
  const fail = (message: string): never => { throw new Error(`Invalid catalog: ${message}`); };
  if (!record(input) || !Array.isArray(input.products) || !input.products.length || !text(input.featuredProductId)) return fail('provide featuredProductId and at least one product.');
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const [index, product] of input.products.entries()) {
    const at = `product ${index + 1}`;
    if (!record(product)) return fail(`${at} must be an object.`);
    for (const field of ['id', 'slug', 'name', 'title', 'subtitle', 'description', 'quantityLabel']) if (!text(product[field])) return fail(`${at} needs ${field}.`);
    if (String(product.id).length > 120 || String(product.slug).length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(product.id)) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(product.slug))) return fail(`${at} ID and slug must use lowercase letters, numbers, and hyphens.`);
    if (ids.has(String(product.id)) || slugs.has(String(product.slug))) return fail(`${at} repeats an ID or slug.`);
    ids.add(String(product.id)); slugs.add(String(product.slug));
    if (!['draft', 'coming-soon', 'available'].includes(String(product.status))) return fail(`${at} has an invalid status.`);
    if (product.currency !== 'usd') return fail(`${at} must use usd.`);
    if (!Number.isInteger(product.maxQuantity) || Number(product.maxQuantity) < 1 || Number(product.maxQuantity) > 10) return fail(`${at} maxQuantity must be 1–10.`);
    if ((product.status === 'available' || product.priceCents !== undefined) && (!Number.isSafeInteger(product.priceCents) || Number(product.priceCents) < 50 || Number(product.priceCents) > 9999999)) return fail(`${at} needs a valid price in cents.`);
    if (!localImage(product.image)) return fail(`${at} needs a local cover image.`);
    if (product.status === 'coming-soon' && !text(product.whatToExpect)) return fail(`${at} needs whatToExpect text.`);
    for (const optional of ['expectedLaunch', 'whatToExpect', 'galleryNote', 'color', 'material', 'asin']) if (product[optional] !== undefined && !text(product[optional])) return fail(`${at} ${optional} must be nonempty text.`);
    for (const optional of ['pieces', 'serviceFor']) if (product[optional] !== undefined && (!Number.isInteger(product[optional]) || Number(product[optional]) < 1)) return fail(`${at} ${optional} must be positive.`);
    if (product.amazonUrl !== undefined) {
      let url: URL;
      try { url = new URL(String(product.amazonUrl)); } catch { return fail(`${at} has an invalid Amazon URL.`); }
      if (url.protocol !== 'https:' || !['amazon.com', 'www.amazon.com'].includes(url.hostname) || url.username || url.password) return fail(`${at} Amazon URL must be an HTTPS amazon.com link.`);
    }
    if (!Array.isArray(product.gallery) || !product.gallery.length) return fail(`${at} needs gallery media.`);
    for (const media of product.gallery) {
      if (!record(media) || !text(media.label)) return fail(`${at} has invalid media.`);
      if (media.type === 'image') {
        if (!localImage(media.src) || !text(media.alt) || !Number.isInteger(media.width) || Number(media.width) < 1 || !Number.isInteger(media.height) || Number(media.height) < 1 || (media.thumbnail !== undefined && !localImage(media.thumbnail))) return fail(`${at} has invalid image metadata.`);
      } else if (media.type === 'video') {
        if (!localImage(media.poster) || !localVideo(media.src) || (media.caption !== undefined && !text(media.caption))) return fail(`${at} needs a video poster and valid caption.`);
      } else return fail(`${at} media type must be image or video.`);
    }
    if (!Array.isArray(product.contents) || product.contents.some(piece => !record(piece) || !text(piece.name) || !text(piece.size) || !text(piece.caption) || !Number.isInteger(piece.quantity) || Number(piece.quantity) < 1)) return fail(`${at} has invalid contents.`);
    if (!Array.isArray(product.specifications) || product.specifications.some(spec => !record(spec) || !text(spec.label) || !text(spec.value))) return fail(`${at} has invalid specifications.`);
    if (product.careHighlights !== undefined && (!Array.isArray(product.careHighlights) || product.careHighlights.some(item => !record(item) || !['dishwasher', 'microwave', 'stack'].includes(String(item.kind)) || !text(item.label)))) return fail(`${at} has invalid care highlights.`);
    if (!Array.isArray(product.care) || product.care.some(line => !text(line))) return fail(`${at} care must be an array of text.`);
  }
  const featured = input.products.find(product => product.id === input.featuredProductId);
  if (!featured || featured.status !== 'available') return fail('featuredProductId must identify an available product.');
  return input as unknown as Catalog;
}
