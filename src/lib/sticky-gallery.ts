const GAP = 24;
const MIN_PREVIEW = 240;

export function galleryFit(viewportWidth: number, viewportHeight: number, headerHeight: number, mediaWidth: number, chromeHeight: number) {
  const top = headerHeight + GAP;
  const available = Math.floor(viewportHeight - top - GAP - chromeHeight);
  return viewportWidth > 800 && available >= MIN_PREVIEW
    ? { top, height: Math.min(Math.floor(mediaWidth / 1.08), available) }
    : null;
}

/** Keep the full gallery accessible, including captions that change with selected media. */
export function attachStickyGallery(gallery: HTMLElement, header: HTMLElement): () => void {
  const preview = gallery.querySelector<HTMLElement>('.gallery-main');
  if (!preview || !('ResizeObserver' in window)) return () => {};
  let frame = 0;
  let stopped = false;
  const reset = () => {
    delete gallery.dataset.gallerySticky;
    gallery.style.removeProperty('--gallery-sticky-top');
    gallery.style.removeProperty('--gallery-preview-height');
  };
  const measure = () => {
    frame = 0;
    if (stopped) return;
    const media = preview.getBoundingClientRect();
    const chrome = gallery.getBoundingClientRect().height - media.height;
    const fit = galleryFit(window.innerWidth, window.innerHeight, header.getBoundingClientRect().height, media.width, chrome);
    if (!fit) { reset(); return; }
    gallery.dataset.gallerySticky = 'true';
    gallery.style.setProperty('--gallery-sticky-top', `${fit.top}px`);
    gallery.style.setProperty('--gallery-preview-height', `${fit.height}px`);
  };
  const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(measure); };
  const observer = new ResizeObserver(schedule);
  observer.observe(gallery); observer.observe(header);
  window.addEventListener('resize', schedule);
  measure();
  return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); reset(); };
}
