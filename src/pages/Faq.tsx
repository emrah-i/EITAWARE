import EmailText from '../components/EmailText';
import { For, Show } from 'solid-js';
import { BRAND } from '../shared/catalog';
import { FAQ_ITEMS } from '../shared/faq';

export default function Faq() {
  return <main id="main-content" tabIndex={-1} class="page-shell faq-page">
    <header data-reveal-group=""><p class="eyebrow">A few good things to know</p>
    <h1 class="page-title">Dinnerware FAQ</h1>
    <p class="page-intro">Simple answers about our dinnerware sets, everyday care, and your order.</p>
    </header><div class="product-accordions"><For each={FAQ_ITEMS}>{item => <details id={item.id} data-reveal-group="">
      <summary><h2>{item.question}</h2><span aria-hidden="true">+</span></summary>
      <div><p><EmailText text={item.answer} /></p><Show when={item.note}><p><EmailText text={item.note!} /></p></Show><Show when={item.link}>{link => <p><a href={link().href}>{link().label}</a></p>}</Show><Show when={item.id === 'broken-arrivals'}><p><a href={`mailto:${BRAND.supportEmail}`}>Email {BRAND.supportEmail}</a></p></Show></div>
    </details>}</For></div>
    <p class="faq-contact" data-reveal-group="">Still have a question? <a href="/contact">Contact us</a> or email <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>.</p>
  </main>;
}
