const POLICY_PATHS = new Set(['/privacy', '/terms', '/shipping-returns']);

/** Reset restored policy visits, while leaving explicit section links to the browser. */
export function attachPolicyScroll(view: Window): () => void {
  if (!POLICY_PATHS.has(view.location.pathname.replace(/\/$/, ''))) return () => {};
  const previous = view.history.scrollRestoration;
  let frame = 0;
  const show = () => {
    if (view.location.hash) return;
    view.history.scrollRestoration = 'manual';
    view.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => view.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  };
  const hide = () => { view.history.scrollRestoration = previous; view.cancelAnimationFrame(frame); };
  show();
  view.addEventListener('pageshow', show);
  view.addEventListener('pagehide', hide);
  return () => { hide(); view.removeEventListener('pageshow', show); view.removeEventListener('pagehide', hide); };
}
