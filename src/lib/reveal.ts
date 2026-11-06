import { animate } from 'motion/mini';

/** Animate complete content groups; their surrounding section backgrounds stay steady. */
export function startReveals(root: Pick<ParentNode, 'querySelectorAll'>): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) return () => {};
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal-group]'));
  const seen = new Set<HTMLElement>();
  const running = new Map<HTMLElement, { animation: ReturnType<typeof animate>; items: { element: HTMLElement; opacity: string }[] }>();
  let stopped = false;

  function finish(element: HTMLElement) {
    const current = running.get(element);
    if (current) {
      running.delete(element);
      current.animation.cancel();
      for (const item of current.items) item.element.style.opacity = item.opacity;
    }
    element.dataset.reveal = 'done';
  }
  function revealTarget(target: Element | null) {
    if (!target) return;
    for (const element of targets) if (element === target || element.contains(target)) {
      seen.add(element); observer.unobserve(element); finish(element);
    }
  }
  function revealHash() {
    try { revealTarget(document.getElementById(decodeURIComponent(window.location.hash.slice(1)))); } catch { /* Ignore malformed fragments. */ }
  }
  const observer = new IntersectionObserver(entries => {
    if (stopped) return;
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      if (!entry.isIntersecting || seen.has(element)) continue;
      seen.add(element); observer.unobserve(element);
      if (element.contains(document.activeElement) || reduced.matches) { finish(element); continue; }
      element.dataset.reveal = 'running';
      const items = (element.hasAttribute('data-reveal-children') ? Array.from(element.children) as HTMLElement[] : [element])
        .map(item => ({ element: item, opacity: item.style.opacity }));
      try {
        const animation = animate(items.map(item => item.element), { opacity: [0, 1] }, { duration: .5, ease: 'easeInOut' });
        running.set(element, { animation, items });
        void animation.then(() => finish(element), () => finish(element));
      } catch {
        for (const item of items) item.element.style.opacity = item.opacity;
        finish(element);
      }
    }
  }, { threshold: 0 });
  const focus = (event: FocusEvent) => revealTarget(event.target instanceof Element ? event.target : null);
  const stop = () => {
    stopped = true; observer.disconnect();
    for (const element of targets) finish(element);
  };
  const preferenceChanged = () => { if (reduced.matches) stop(); };
  document.addEventListener('focusin', focus);
  window.addEventListener('hashchange', revealHash);
  window.addEventListener('pagehide', stop);
  reduced.addEventListener('change', preferenceChanged);
  for (const element of targets) {
    const rect = element.getBoundingClientRect();
    if (element.dataset.reveal === 'done' || (rect.bottom > 0 && rect.top < window.innerHeight)) {
      seen.add(element); finish(element);
    } else { element.dataset.reveal = 'ready'; observer.observe(element); }
  }
  revealTarget(document.activeElement);
  revealHash();
  return () => {
    stop();
    document.removeEventListener('focusin', focus);
    window.removeEventListener('hashchange', revealHash);
    window.removeEventListener('pagehide', stop);
    reduced.removeEventListener('change', preferenceChanged);
  };
}
