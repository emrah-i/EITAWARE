import { describe, expect, it, vi } from 'vitest';
import { attachPolicyScroll } from '../src/lib/policy-scroll';
function browser(pathname: string, hash = '') {
  const target = new EventTarget();
  const scrollTo = vi.fn();
  const frames: FrameRequestCallback[] = [];
  const view = { location: { pathname, hash }, history: { scrollRestoration: 'auto' }, scrollTo,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }),
    cancelAnimationFrame: vi.fn(), addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target),
  } as unknown as Window;
  return { view, target, scrollTo, frames };
}
describe('agreement navigation', () => {
  it.each(['/privacy', '/terms', '/shipping-returns', '/terms/'])('resets ordinary and restored visits to %s', path => {
    const { view, target, scrollTo, frames } = browser(path);
    const cleanup = attachPolicyScroll(view);
    expect(view.history.scrollRestoration).toBe('manual');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    frames[0](0);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    target.dispatchEvent(new Event('pagehide'));
    expect(view.history.scrollRestoration).toBe('auto');
    target.dispatchEvent(new Event('pageshow'));
    expect(scrollTo).toHaveBeenCalledTimes(3);
    cleanup(); target.dispatchEvent(new Event('pageshow'));
    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(view.history.scrollRestoration).toBe('auto');
  });
  it.each([['/shipping-returns', '#arrives-perfect'], ['/products', ''], ['/faq', '#food-safe']])('preserves explicit anchors and non-policy restoration: %s%s', (path, hash) => {
    const { view, scrollTo } = browser(path, hash);
    attachPolicyScroll(view)();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(view.history.scrollRestoration).toBe('auto');
  });
});
