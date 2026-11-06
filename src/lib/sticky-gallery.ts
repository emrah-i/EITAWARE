const GAP = 24;
export function galleryFit(viewportWidth: number, viewportHeight: number, headerHeight: number, mediaHeight: number, chromeHeight: number) {
  const top = headerHeight + GAP;
  return viewportWidth > 800 && mediaHeight + chromeHeight <= viewportHeight - top - GAP
    ? { top }
    : null;
}

/** Pin only galleries that fit naturally; never shrink media to force a fit. */
export function attachStickyGallery(gallery: HTMLElement, header: HTMLElement): () => void {
  const preview = gallery.querySelector<HTMLElement>('.gallery-main');
  if (!preview || !('ResizeObserver' in window)) return () => {};
  let frame = 0;
  let stopped = false;
  const reset = () => {
    delete gallery.dataset.gallerySticky;
    gallery.style.removeProperty('--gallery-sticky-top');
  };
  const measure = () => {
    frame = 0;
    if (stopped) return;
    const media = preview.getBoundingClientRect();
    const chrome = gallery.getBoundingClientRect().height - media.height;
    const fit = galleryFit(window.innerWidth, window.innerHeight, header.getBoundingClientRect().height, media.height, chrome);
    if (!fit) { reset(); return; }
    gallery.dataset.gallerySticky = 'true';
    gallery.style.setProperty('--gallery-sticky-top', `${fit.top}px`);
  };
  const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(measure); };
  const observer = new ResizeObserver(schedule);
  observer.observe(gallery); observer.observe(header);
  window.addEventListener('resize', schedule);
  measure();
  return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); reset(); };
}
