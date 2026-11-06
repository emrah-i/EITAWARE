import type { CatalogProduct, ImageMedia } from './catalog';

/** Reuse the authored photo dimensions and responsive source across product previews. */
export function productPhoto(product: CatalogProduct) {
  const image = product.gallery.find((item): item is ImageMedia => item.type === 'image' && item.src === product.image);
  return {
    src: product.image,
    alt: image?.alt || product.name,
    width: image?.width,
    height: image?.height,
    srcset: image?.thumbnail ? `${image.thumbnail} 640w, ${image.src} ${image.width}w` : undefined,
  };
}
