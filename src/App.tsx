import { Match, Switch, onMount, onCleanup } from 'solid-js';
import { Header, Footer } from './components/Layout';
import Home from './pages/Home';
import Product from './pages/Product';
import Products from './pages/Products';
import { findPublishedProduct } from './shared/catalog';
import Confirmation from './pages/Confirmation';
import Contact from './pages/Contact';
import Faq from './pages/Faq';
import PolicyPage from './pages/Policies';
import { deferReveals } from './lib/reveal-loader';
import { attachPolicyScroll } from './lib/policy-scroll';

export default function App(props: { path: string }) {
  onMount(() => {
    onCleanup(attachPolicyScroll(window));
    const root = document.getElementById('root');
    if (root) onCleanup(deferReveals(root));
  });
  const path = () => props.path.split('?')[0].replace(/\/$/, '') || '/';
  const product = () => path().startsWith('/products/') ? findPublishedProduct(path().slice('/products/'.length)) : undefined;
  return <><Header path={path()} /><Switch fallback={<main id="main-content" tabIndex={-1} class="page-shell not-found"><div data-reveal-group=""><p class="eyebrow">404 A little out of place</p><h1 class="page-title">Let's get you<br /><em>back to the table</em></h1><p class="page-intro">We couldn't find that page. Your next favorite set is just a click away.</p><a class="button" href="/">Back to home <span aria-hidden="true">→</span></a></div></main>}><Match when={path() === '/'}><Home /></Match><Match when={path() === '/products'}><Products /></Match><Match when={product()}>{item => <Product product={item()} />}</Match><Match when={path() === '/order-confirmation'}><Confirmation /></Match><Match when={path() === '/contact'}><Contact /></Match><Match when={path() === '/faq'}><Faq /></Match><Match when={path() === '/privacy'}><PolicyPage kind="privacy" /></Match><Match when={path() === '/terms'}><PolicyPage kind="terms" /></Match><Match when={path() === '/shipping-returns'}><PolicyPage kind="shipping-returns" /></Match></Switch><Footer /></>;
}
