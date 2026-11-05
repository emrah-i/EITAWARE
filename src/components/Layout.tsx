import { createSignal, For, onMount, onCleanup, Show } from 'solid-js';
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
  const links = [{ label: 'Home', href: '/' }, { label: 'Products', href: '/products' }, { label: 'Contact', href: '/contact' }];
  return <>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <Show when={announcement()}><div class="announcement"><span>Complimentary standard shipping · Lower 48 states + D.C.</span><button aria-label="Dismiss announcement" onClick={dismissAnnouncement}><span aria-hidden="true">×</span></button></div></Show>
    <header class="site-header">
      <div class="nav-inner">
        <a class="brand-link" href="/" aria-label="EITAWARE home"><img src="/images/logo.png" alt="EITAWARE" width="1152" height="261" /></a>
        <nav class="desktop-nav" aria-label="Main navigation"><For each={links}>{link => <a href={link.href} aria-current={(props.path === link.href || (link.href === '/products' && props.path.startsWith('/products/'))) ? 'page' : undefined}>{link.label}</a>}</For></nav>
        <a class="nav-amazon" aria-label="Shop EITAWARE on Amazon" href={BRAND.amazonUrl} target="_blank" rel="noopener noreferrer"><span class="nav-amazon-desktop">Shop on </span>Amazon <ArrowIcon diagonal /></a>
        <button ref={menuButton} class="menu-toggle" aria-label={menuOpen() ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen()} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen())}><span /><span /></button>
      </div>
      <Show when={menuOpen()}><nav id="mobile-navigation" class="mobile-nav" aria-label="Mobile navigation"><For each={links}>{link => <a href={link.href} aria-current={(props.path === link.href || (link.href === '/products' && props.path.startsWith('/products/'))) ? 'page' : undefined}>{link.label}<ArrowIcon /></a>}</For><a href={BRAND.amazonUrl} target="_blank" rel="noopener noreferrer">Shop on Amazon <ArrowIcon diagonal /></a></nav></Show>
    </header>
  </>;
}

export function Footer() {
  return <footer class="site-footer">
    <div class="footer-top"><div class="footer-brand"><a href="/" aria-label="EITAWARE home"><img src="/images/logo.png" width="1152" height="261" alt="EITAWARE" /></a><p>A place for good food.<br />A reason to come together.</p></div>
      <div class="footer-links"><p class="footer-label">Explore</p><a href="/">Home</a><a href="/products">Our collection</a><a href={BRAND.amazonUrl} target="_blank" rel="noopener noreferrer">Shop on Amazon <ArrowIcon diagonal /></a></div>
      <div class="footer-links"><p class="footer-label">Here to help</p><a href="/contact">Contact us</a><a href="/shipping-returns">Shipping &amp; returns</a><a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></div>
    </div>
    <div class="footer-bottom"><span>© {new Date().getUTCFullYear()} EITAWARE. {BRAND.legalName}.</span><div><a href="/privacy">Privacy policy</a><a href="/terms">Terms of service</a></div><span class="footer-location">Maryland, USA</span></div>
  </footer>;
}
