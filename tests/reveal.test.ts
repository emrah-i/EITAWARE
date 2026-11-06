import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startReveals } from '../src/lib/reveal';

const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn() }));
vi.mock('motion/mini', () => ({ animate: animateMock }));

class Events {
  listeners = new Map<string, Set<(event: { target?: unknown }) => void>>();
  addEventListener(type: string, listener: (event: { target?: unknown }) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: { target?: unknown }) => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: { target?: unknown } = {}) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  get listenerCount() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
}
class TestElement {
  style = { opacity: '', transform: '' };
  dataset: Record<string, string> = {};
  children: TestElement[] = [];
  attributes = new Set<string>();
  rect = { top: 1200, bottom: 1400 };
  animate() {}
  hasAttribute(name: string) { return this.attributes.has(name); }
  getBoundingClientRect() { return this.rect; }
  contains(target: unknown): boolean { return target === this || this.children.some(child => child.contains(target)); }
}
class Observer {
  static all: Observer[] = [];
  observed = new Set<TestElement>();
  disconnected = false;
  constructor(private callback: (entries: { target: TestElement; isIntersecting: boolean }[]) => void) { Observer.all.push(this); }
  observe(element: TestElement) { this.observed.add(element); }
  unobserve(element: TestElement) { this.observed.delete(element); }
  disconnect() { this.disconnected = true; this.observed.clear(); }
  enter(element: TestElement, isIntersecting = true) { this.callback([{ target: element, isIntersecting }]); }
}

type Playback = { cancel: ReturnType<typeof vi.fn>; complete: () => void; fail: () => void };
let elements: TestElement[];
let root: Parameters<typeof startReveals>[0];
let preference: Events & { matches: boolean };
let browser: Events & { matchMedia: () => typeof preference; location: { hash: string }; innerHeight: number; IntersectionObserver?: typeof Observer };
let doc: Events & { activeElement: TestElement | null; getElementById: ReturnType<typeof vi.fn> };
let playbacks: Playback[];
let frames: Map<number, FrameRequestCallback>;
let timers: Map<number, { at: number; callback: () => void | Promise<void> }>;
let nextHandle: number;
let clock: number;
let cleanups: (() => void)[];
function start() { const cleanup = startReveals(root); cleanups.push(cleanup); return cleanup; }
async function nextPaint() {
  const callbacks = [...frames.values()]; frames.clear();
  for (const callback of callbacks) await callback(0);
}
async function advanceTime(ms: number) {
  clock += ms;
  for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); await timer.callback(); }
}

beforeEach(() => {
  vi.doUnmock('../src/lib/reveal'); vi.resetModules();
  elements = [new TestElement(), new TestElement()];
  root = { querySelectorAll: () => elements } as unknown as Parameters<typeof startReveals>[0];
  preference = Object.assign(new Events(), { matches: false });
  browser = Object.assign(new Events(), { matchMedia: () => preference, location: { hash: '' }, innerHeight: 800, IntersectionObserver: Observer });
  doc = Object.assign(new Events(), { activeElement: null as TestElement | null, getElementById: vi.fn(() => null as TestElement | null) });
  Observer.all = []; playbacks = []; cleanups = []; frames = new Map(); timers = new Map(); nextHandle = 0; clock = 0;
  vi.stubGlobal('window', browser); vi.stubGlobal('document', doc);
  vi.stubGlobal('Element', TestElement); vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.set(++nextHandle, callback); return nextHandle; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  vi.stubGlobal('setTimeout', vi.fn((callback: () => void | Promise<void>, delay: number) => { timers.set(++nextHandle, { at: clock + delay, callback }); return nextHandle; }));
  vi.stubGlobal('clearTimeout', vi.fn((id: number) => timers.delete(id)));
  animateMock.mockReset().mockImplementation((items: TestElement[]) => {
    let resolve = () => {}; let reject = () => {};
    const cancel = vi.fn();
    playbacks.push({ cancel, complete: () => resolve(), fail: () => reject() });
    // Model partially completed opacity while preserving existing transforms.
    for (const element of items) element.style.opacity = '.4';
    return { cancel, then: (success: () => void, failure: () => void) => { resolve = success; reject = failure; } };
  });
});
afterEach(() => { for (const cleanup of cleanups) cleanup(); vi.doUnmock('../src/lib/reveal'); vi.unstubAllGlobals(); });

describe('complete-group reveal enhancement', () => {
  it.each(['reduced motion', 'unsupported observer', 'unsupported animation'])('keeps content untouched with %s', mode => {
    if (mode === 'reduced motion') preference.matches = true;
    if (mode === 'unsupported observer') delete browser.IntersectionObserver;
    const originalAnimate = TestElement.prototype.animate;
    if (mode === 'unsupported animation') Object.defineProperty(TestElement.prototype, 'animate', { configurable: true, writable: true, value: undefined });
    try {
      start();
      expect(Observer.all).toHaveLength(0); expect(animateMock).not.toHaveBeenCalled();
      expect(elements.map(element => ({ ...element.style }))).toEqual([{ opacity: '', transform: '' }, { opacity: '', transform: '' }]);
      expect(elements.every(element => !element.dataset.reveal)).toBe(true);
      expect(doc.listenerCount + browser.listenerCount + preference.listenerCount).toBe(0);
    } finally { TestElement.prototype.animate = originalAnimate; }
  });

  it('leaves waiting content visible, then fades each entering group once for 500ms without transforms', () => {
    elements[0].style = { opacity: '.9', transform: 'scale(1)' };
    start(); const observer = Observer.all[0];
    expect(elements[0].style).toEqual({ opacity: '.9', transform: 'scale(1)' });
    expect(elements[1].style).toEqual({ opacity: '', transform: '' });
    observer.enter(elements[0], false); expect(animateMock).not.toHaveBeenCalled();
    observer.enter(elements[0]);
    expect(animateMock).toHaveBeenCalledWith([elements[0]], { opacity: [0, 1] }, { duration: .5, ease: 'easeInOut' });
    expect(elements[0].style.transform).toBe('scale(1)');
    expect(observer.observed.has(elements[0])).toBe(false);
    playbacks[0].complete();
    expect(playbacks[0].cancel).toHaveBeenCalledOnce();
    expect(elements[0].style).toEqual({ opacity: '.9', transform: 'scale(1)' });
    observer.enter(elements[0]); expect(animateMock).toHaveBeenCalledOnce();
  });

  it('batches direct children into one opacity animation while leaving their section background and transforms steady', () => {
    const first = new TestElement(); const second = new TestElement(); const nested = new TestElement();
    first.children.push(nested); first.style = { opacity: '.8', transform: 'rotate(2deg)' };
    second.style = { opacity: '.6', transform: 'scale(.95)' };
    elements[0].children.push(first, second); elements[0].attributes.add('data-reveal-children');
    start(); Observer.all[0].enter(elements[0]);
    expect(animateMock).toHaveBeenCalledWith([first, second], { opacity: [0, 1] }, { duration: .5, ease: 'easeInOut' });
    expect(elements[0].style).toEqual({ opacity: '', transform: '' });
    expect(nested.style).toEqual({ opacity: '', transform: '' });
    expect([first.style.transform, second.style.transform]).toEqual(['rotate(2deg)', 'scale(.95)']);
    playbacks[0].complete();
    expect(first.style).toEqual({ opacity: '.8', transform: 'rotate(2deg)' });
    expect(second.style).toEqual({ opacity: '.6', transform: 'scale(.95)' });
  });

  it('never resets groups already visible, previously revealed, or revealed during an earlier enhancement', () => {
    elements.push(new TestElement(), new TestElement());
    elements[0].rect = { top: 0, bottom: 200 };
    elements[1].rect = { top: -100, bottom: 20 };
    elements[2].dataset.reveal = 'done';
    elements[3].rect = { top: 800, bottom: 1000 };
    const cleanup = start(); const observer = Observer.all[0];
    expect([...observer.observed]).toEqual([elements[3]]);
    for (const element of elements.slice(0, 3)) observer.enter(element);
    expect(animateMock).not.toHaveBeenCalled();
    expect(elements.every(element => element.style.opacity === '')).toBe(true);
    cleanup(); start();
    expect(Observer.all[1].observed.size).toBe(0);
    for (const element of elements) Observer.all[1].enter(element);
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('skips a group containing keyboard focus and cancels its child batch when focus enters', () => {
    const focused = new TestElement(); elements[0].children.push(focused); doc.activeElement = focused;
    const child = new TestElement(); child.style.transform = 'scale(.9)';
    elements[1].children.push(child); elements[1].attributes.add('data-reveal-children');
    start(); const observer = Observer.all[0];
    observer.enter(elements[0]); expect(animateMock).not.toHaveBeenCalled();
    observer.enter(elements[1]); doc.emit('focusin', { target: child });
    expect(playbacks[0].cancel).toHaveBeenCalledOnce();
    expect(child.style).toEqual({ opacity: '', transform: 'scale(.9)' });
    observer.enter(elements[1]); expect(animateMock).toHaveBeenCalledOnce();
  });

  it('skips initial hash targets and cancels a group on later hash navigation', () => {
    browser.location.hash = '#care%20details'; doc.getElementById.mockReturnValue(elements[0]);
    start(); const observer = Observer.all[0];
    expect(doc.getElementById).toHaveBeenCalledWith('care details');
    observer.enter(elements[0]); expect(animateMock).not.toHaveBeenCalled();
    observer.enter(elements[1]); doc.getElementById.mockReturnValue(elements[1]);
    browser.location.hash = '#returns'; browser.emit('hashchange');
    expect(playbacks[0].cancel).toHaveBeenCalledOnce();
    expect(elements[1].style).toEqual({ opacity: '', transform: '' });
    browser.location.hash = '#%'; expect(() => browser.emit('hashchange')).not.toThrow();
  });

  it('finishes all groups when reduced motion is enabled, then removes listeners on disposal', () => {
    const cleanup = start(); const observer = Observer.all[0]; observer.enter(elements[0]);
    preference.matches = true; preference.emit('change');
    expect(observer.disconnected).toBe(true); expect(playbacks[0].cancel).toHaveBeenCalledOnce();
    expect(elements[0].style).toEqual({ opacity: '', transform: '' });
    expect(elements.every(element => element.dataset.reveal === 'done')).toBe(true);
    observer.enter(elements[1]); expect(animateMock).toHaveBeenCalledOnce();
    cleanup(); expect(doc.listenerCount + browser.listenerCount + preference.listenerCount).toBe(0);
  });

  it('restores running content on pagehide and ignores later observer callbacks', () => {
    start(); const observer = Observer.all[0]; observer.enter(elements[0]); browser.emit('pagehide');
    expect(observer.disconnected).toBe(true); expect(playbacks[0].cancel).toHaveBeenCalledOnce();
    expect(elements[0].style).toEqual({ opacity: '', transform: '' });
    observer.enter(elements[1]); expect(animateMock).toHaveBeenCalledOnce();
    expect(elements.every(element => element.dataset.reveal === 'done')).toBe(true);
  });

  it('restores every original child opacity when animation creation throws or playback rejects', () => {
    const child = new TestElement(); child.style = { opacity: '.7', transform: 'rotate(3deg)' };
    elements[0].children.push(child); elements[0].attributes.add('data-reveal-children');
    animateMock.mockImplementationOnce((items: TestElement[]) => { for (const item of items) item.style.opacity = '0'; throw new Error('Animation unavailable'); });
    start(); const observer = Observer.all[0];
    expect(() => observer.enter(elements[0])).not.toThrow();
    expect(child.style).toEqual({ opacity: '.7', transform: 'rotate(3deg)' });
    expect(elements[0].dataset.reveal).toBe('done');
    observer.enter(elements[1]); playbacks[0].fail();
    expect(elements[1].style).toEqual({ opacity: '', transform: '' });
  });
});

describe('deferred reveal loading', () => {
  it.each(['reduced motion', 'unsupported observer'])('does not schedule enhancement with %s', async mode => {
    if (mode === 'reduced motion') preference.matches = true;
    else delete browser.IntersectionObserver;
    const { deferReveals } = await import('../src/lib/reveal-loader');
    cleanups.push(deferReveals(root));
    expect(frames.size + timers.size).toBe(0); expect(Observer.all).toHaveLength(0);
    expect(doc.listenerCount + browser.listenerCount).toBe(0);
  });

  it('waits for two paints plus 500ms, then hands listeners over and disposes enhancement', async () => {
    const { deferReveals } = await import('../src/lib/reveal-loader');
    const cleanup = deferReveals(root); cleanups.push(cleanup);
    expect(Observer.all).toHaveLength(0); expect(timers.size).toBe(0);
    await nextPaint(); expect(Observer.all).toHaveLength(0); expect(timers.size).toBe(0);
    await nextPaint(); expect(Observer.all).toHaveLength(0); expect(timers.size).toBe(1);
    await advanceTime(499); expect(Observer.all).toHaveLength(0);
    await advanceTime(1); expect(Observer.all).toHaveLength(1);
    expect(doc.listeners.get('focusin')?.size).toBe(1); expect(browser.listeners.get('hashchange')?.size).toBe(1);
    cleanup(); expect(Observer.all[0].disconnected).toBe(true);
    expect(doc.listenerCount + browser.listenerCount + preference.listenerCount).toBe(0);
  });

  it('protects initial focus and hash targets before importing enhancement', async () => {
    const focused = new TestElement(); elements[0].children.push(focused); doc.activeElement = focused;
    browser.location.hash = '#shipping'; doc.getElementById.mockReturnValue(elements[1]);
    const { deferReveals } = await import('../src/lib/reveal-loader');
    cleanups.push(deferReveals(root));
    expect(elements.every(element => element.dataset.reveal === 'done')).toBe(true);
    await nextPaint(); await nextPaint(); await advanceTime(500);
    expect(Observer.all[0].observed.size).toBe(0); expect(animateMock).not.toHaveBeenCalled();
  });

  it('protects focus and hash navigation during the delay, including malformed fragments', async () => {
    const { deferReveals } = await import('../src/lib/reveal-loader');
    cleanups.push(deferReveals(root));
    doc.emit('focusin', { target: elements[0] });
    browser.location.hash = '#care%20details'; doc.getElementById.mockReturnValue(elements[1]); browser.emit('hashchange');
    expect(doc.getElementById).toHaveBeenCalledWith('care details');
    browser.location.hash = '#%'; expect(() => browser.emit('hashchange')).not.toThrow();
    expect(elements.every(element => element.dataset.reveal === 'done')).toBe(true);
    await nextPaint(); await nextPaint(); await advanceTime(500);
    expect(Observer.all[0].observed.size).toBe(0); expect(animateMock).not.toHaveBeenCalled();
  });

  it.each(['first paint', 'timer'])('cancels scheduled work and early listeners when disposed during the %s', async stage => {
    const { deferReveals } = await import('../src/lib/reveal-loader');
    const cleanup = deferReveals(root); cleanups.push(cleanup);
    await nextPaint(); if (stage === 'timer') await nextPaint();
    cleanup(); await nextPaint(); await advanceTime(500);
    expect(Observer.all).toHaveLength(0); expect(frames.size + timers.size).toBe(0);
    expect(doc.listenerCount + browser.listenerCount).toBe(0);
    expect(elements.every(element => element.style.opacity === '' && element.style.transform === '')).toBe(true);
  });

  it('does not initialize if disposed while the optional import is pending', async () => {
    const { deferReveals } = await import('../src/lib/reveal-loader');
    const cleanup = deferReveals(root); cleanups.push(cleanup);
    await nextPaint(); await nextPaint();
    const loading = advanceTime(500); cleanup(); await loading;
    expect(Observer.all).toHaveLength(0);
    expect(elements.every(element => !element.dataset.reveal)).toBe(true);
  });

  it('leaves CSS content and navigation usable if the optional chunk fails to load', async () => {
    vi.doMock('../src/lib/reveal', () => { throw new Error('Chunk unavailable'); });
    const { deferReveals } = await import('../src/lib/reveal-loader');
    const cleanup = deferReveals(root); cleanups.push(cleanup);
    await nextPaint(); await nextPaint(); await expect(advanceTime(500)).resolves.toBeUndefined();
    expect(Observer.all).toHaveLength(0);
    expect(elements.every(element => element.style.opacity === '' && element.style.transform === '' && !element.dataset.reveal)).toBe(true);
    doc.emit('focusin', { target: elements[0] }); expect(elements[0].dataset.reveal).toBe('done');
    cleanup(); expect(doc.listenerCount + browser.listenerCount).toBe(0);
  });

  it('does not initialize motion if the user enables reduced motion during the delay', async () => {
    const { deferReveals } = await import('../src/lib/reveal-loader');
    cleanups.push(deferReveals(root));
    await nextPaint(); await nextPaint(); preference.matches = true;
    await advanceTime(500);
    expect(Observer.all).toHaveLength(0); expect(animateMock).not.toHaveBeenCalled();
    expect(elements.every(element => element.style.opacity === '' && element.style.transform === '')).toBe(true);
  });
});
