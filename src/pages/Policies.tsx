import EmailText from '../components/EmailText';
import { Match, Switch } from 'solid-js';
import { ARRIVES_PERFECT } from '../shared/guarantee';
import { BRAND } from '../shared/catalog';

export default function PolicyPage(props: { kind: 'privacy' | 'terms' | 'shipping-returns' }) {
  return (
    <main id="main-content" tabIndex={-1} class="page-shell policy-content">
      <Switch>
        <Match when={props.kind === 'shipping-returns'}>
          <header data-reveal-group=""><p class="eyebrow">The details, made simple</p>
          <h1>Shipping &amp; returns</h1>
          </header>
          <section data-reveal-group="">
          <h2>Where we ship</h2>
          <p>We offer free standard shipping to the lower 48 states and Washington, D.C. We do not currently ship website orders to Alaska, Hawaii, U.S. territories, military addresses, or international destinations.</p>
          </section>
          <section data-reveal-group="">
          <h2>Processing &amp; delivery</h2>
          <p>Orders are normally processed within 1–2 business days. Our team arranges delivery through Amazon Multi-Channel Fulfillment. Delivery time depends on the destination and carrier; we do not guarantee an exact arrival date. We will email tracking details when available.</p>
          <p>Check your shipping address before paying. If you need to change or cancel an order, email us as soon as possible. We cannot guarantee a change once fulfillment has begun.</p>
          </section>
          <section data-reveal-group="">
          <h2>Returns</h2>
          <p>You may request a return within 30 days of delivery. Items must be unused and returned in their original packaging. Email <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a> with your order reference to request authorization and return instructions before sending anything back.</p>
          <p>The buyer pays return shipping unless the item arrived damaged or we sent the wrong item. Once we receive and inspect an authorized return, we will let you know the outcome and issue any approved refund to the original payment method. Your payment provider’s processing time may vary.</p>
          </section>
          <section data-reveal-group="">
          <h2 id="arrives-perfect">Our 'arrives perfect' guarantee</h2>
          <p>{ARRIVES_PERFECT.qualification}</p>
          <p>{ARRIVES_PERFECT.headline}</p>
          <p><EmailText text={ARRIVES_PERFECT.text} /></p>
          <p>If we send an incorrect item, we'll send the correct item or refund you.</p>
          </section>
          <section data-reveal-group="">
          <h2>Amazon purchases</h2>
          <p>These policies cover purchases made on eitaware.com. Orders placed on Amazon are handled through Amazon’s order, delivery, and return processes.</p>
          </section>
        </Match>
        <Match when={props.kind === 'privacy'}>
          <header data-reveal-group=""><p class="eyebrow">The details, made simple</p>
          <h1>Privacy policy</h1>
          <p class="policy-updated">Last updated: November 2026</p>
          <p>{BRAND.name} is operated by {BRAND.legalName}, Maryland, United States. This policy explains how we use information when you visit eitaware.com, contact us, or place a website order.</p>
          </header>
          <section data-reveal-group="">
          <h2>Information we collect</h2>
          <p>When you order, we collect your name, email, delivery address, ordered items, payment reference, and order status. When you contact us, we collect the name, email, subject, and message you submit. For broken-arrival guarantee claims, we also collect your order reference and video evidence showing the set, all damaged pieces, and the packaging. Our hosting provider may process technical information such as IP addresses and request logs to operate and protect the website.</p>
          </section>
          <section data-reveal-group="">
          <h2>How we use information</h2>
          <p>We use this information to process payment, arrange delivery, provide order updates and customer support, review guarantee claims, prevent abuse, maintain business records, and meet applicable obligations. We do not sell your personal information. This website does not use marketing trackers or an email marketing list.</p>
          </section>
          <section data-reveal-group="">
          <h2>Service providers</h2>
          <p>Cloudflare hosts the website and stores our order and contact records. Stripe provides the payment page and payment processing; we do not receive or store your full card number or security code. Resend delivers our operational emails. We share the delivery information needed to fulfill your order with Amazon Multi-Channel Fulfillment and its delivery providers.</p>
          <p>If you follow a link to Amazon, Amazon’s own privacy policy and services apply to your activity there. Stripe’s payment page may use cookies or similar technology for payments and fraud prevention.</p>
          </section>
          <section data-reveal-group="">
          <h2>Browser storage &amp; records</h2>
          <p>We use limited browser storage to remember a dismissed announcement and avoid duplicate form or checkout submissions. We retain order records as needed for fulfillment, support, accounting, and applicable obligations. Contact messages are kept as needed to address the request. Please avoid sending sensitive payment information through the contact form.</p>
          </section>
          <section data-reveal-group="">
          <h2>Your questions &amp; requests</h2>
          <p>To ask about your information or request access, correction, or deletion, email <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>. We may need to verify your request and retain records required for legitimate business or legal purposes.</p>
          </section>
          <section data-reveal-group="">
          <h2>Updates</h2>
          <p>We may update this policy as our services change. The current version will be posted on this page.</p>
          </section>
        </Match>
        <Match when={props.kind === 'terms'}>
          <header data-reveal-group=""><p class="eyebrow">The details, made simple</p>
          <h1>Terms of service</h1>
          <p class="policy-updated">Last updated: November 2026</p>
          <p>This website is operated by {BRAND.legalName}, a Maryland business trading as {BRAND.name}. These terms apply to purchases made on eitaware.com. For questions, contact <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>.</p>
          </header>
          <section data-reveal-group="">
          <h2>Products &amp; pricing</h2>
          <p>Prices are listed in U.S. dollars. Applicable tax is calculated at checkout. Standard shipping to eligible destinations is included. Review the product details, quantity, delivery address, and final total before submitting payment.</p>
          <p>Reactive glaze can vary in color and pattern between pieces. Product photos show the design, but screen settings and natural glaze variation may affect its appearance. Follow the product’s care instructions.</p>
          </section>
          <section data-reveal-group="">
          <h2>Orders &amp; payment</h2>
          <p>Stripe processes website payments on its secure payment page. We do not store your full card details. Please provide accurate contact and delivery information. We may contact you if an order cannot be completed due to availability, an incorrect price, or another issue. If we cancel a paid order, we will refund the payment.</p>
          <p>A payment confirmation acknowledges your payment; it is not a shipping confirmation. Our team arranges fulfillment through Amazon Multi-Channel Fulfillment and sends tracking separately when available.</p>
          </section>
          <section data-reveal-group="">
          <h2>Delivery, changes &amp; returns</h2>
          <p>Please read our <a href="/shipping-returns">shipping and returns policy</a> for eligible destinations, processing times, return conditions, and damage support. Contact us promptly to request an order change or cancellation; changes may not be possible after fulfillment begins.</p>
          <p>Orders placed on eitaware.com are covered by our <a href={ARRIVES_PERFECT.href}>arrives perfect guarantee</a>, as described in our Shipping &amp; Returns policy.</p>
          <p><EmailText text={ARRIVES_PERFECT.evidenceRequirement} /></p>
          </section>
          <section data-reveal-group="">
          <h2>Using the website</h2>
          <p>Please do not interfere with the website, attempt unauthorized access, or submit false or abusive requests. EITAWARE branding, copy, and product media may not be reused without permission.</p>
          </section>
          <section data-reveal-group="">
          <h2>Third-party services &amp; your rights</h2>
          <p>Amazon links lead to a separate website with its own terms. Payment and delivery services may also have terms that apply to their services. These terms do not limit rights that cannot be waived under applicable consumer law.</p>
          </section>
          <section data-reveal-group="">
          <h2>Privacy &amp; updates</h2>
          <p>Our <a href="/privacy">privacy policy</a> explains how we handle personal information. We may update these terms for future visits and orders; the terms presented when you place your order apply to that order.</p>
          </section>
        </Match>
      </Switch>
    </main>
  );
}
