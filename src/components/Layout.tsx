import { createSignal, For, onMount, onCleanup, Show } from 'solid-js';
import { amazonUrl } from '../shared/amazon';
import { BRAND } from '../shared/catalog';
import { ArrowIcon } from './Icon';

export function Header(props: { path: string }) {
  const [announcement, setAnnouncement] = createSignal(true);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuButton: HTMLButtonElement | undefined;
  onMount(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menuOpen()) { setMenuOpen(false); menuButton?.focus(); } };
    document.addEventListener('keydown', escape);
    onCleanup(() => document.removeEventListener('keydown', escape));
    try { setAnnouncement(sessionStorage.getItem('eitaware-announcement-dismissed') !== '1'); } catch { /* Storage is optional. */ }
  });
  function dismissAnnouncement() {
    setAnnouncement(false);
    try { sessionStorage.setItem('eitaware-announcement-dismissed', '1'); } catch { /* Storage is optional. */ }
  }
  const links = [{ label: 'Home', href: '/' }, { label: 'Products', href: '/products' }, { label: 'FAQ', href: '/faq' }, { label: 'Contact', href: '/contact' }];
  return <>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <Show when={announcement()}><div class="announcement"><a class="announcement-link" href="/products">Free standard shipping to the lower 48 states + D.C.</a><button type="button" aria-label="Dismiss announcement" onClick={dismissAnnouncement}><span aria-hidden="true">×</span></button></div></Show>
    <header class="site-header">
      <div class="nav-inner">
        <a class="brand-link" href="/" aria-label="EITAWARE home"><span class="brand-wordmark">{BRAND.name}</span></a>
        <nav class="desktop-nav" aria-label="Main navigation"><For each={links}>{link => <a href={link.href} aria-current={(props.path === link.href || (link.href === '/products' && props.path.startsWith('/products/'))) ? 'page' : undefined}>{link.label}</a>}</For></nav>
        <a class="nav-amazon" aria-label="Shop EITAWARE on Amazon" href={amazonUrl('header')} target="_blank" rel="noopener"><span><span class="nav-amazon-desktop">Shop on </span>Amazon</span><ArrowIcon diagonal /></a>
        <button ref={menuButton} class="menu-toggle" aria-label={menuOpen() ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen()} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen())}><span /><span /></button>
      </div>
      <Show when={menuOpen()}><nav id="mobile-navigation" class="mobile-nav" aria-label="Mobile navigation"><For each={links}>{link => <a href={link.href} aria-current={(props.path === link.href || (link.href === '/products' && props.path.startsWith('/products/'))) ? 'page' : undefined}>{link.label}<ArrowIcon /></a>}</For><a href={amazonUrl('header')} target="_blank" rel="noopener">Shop on Amazon <ArrowIcon diagonal /></a></nav></Show>
    </header>
  </>;
}

export function Footer() {
  return <footer class="site-footer">
    <div class="footer-top" data-reveal-group=""><div class="footer-brand"><a class="footer-wordmark" href="/" aria-label="EITAWARE home"><span class="brand-wordmark">{BRAND.name}</span></a><p class="footer-slogan"><span>Simple Elegance,</span><br /><span>Beautifully Served</span></p></div>
      <div class="footer-links"><p class="footer-label">Explore</p><a href="/">Home</a><a href="/products">Our Collection</a><a href={amazonUrl('footer')} target="_blank" rel="noopener">Shop on Amazon <ArrowIcon diagonal /></a></div>
      <div class="footer-links"><p class="footer-label">Here to Help</p><a href="/faq">FAQ</a><a href="/contact">Contact</a><a href="/shipping-returns">Shipping and Returns</a><a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></div>
    </div>
    <div class="footer-bottom" data-reveal-group=""><span>© {new Date().getUTCFullYear()} EITAWARE. {BRAND.legalName}.</span><div><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div></div>
  </footer>;
}
