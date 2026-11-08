import { BRAND } from '../shared/catalog';
import { ArrowIcon } from '../components/Icon';

export default function Confirmation() {
  return <main id="main-content" tabIndex={-1} class="page-shell confirmation-page">
    <h1 class="page-title">Thank you for<br /><em>choosing us</em></h1>
    <p class="page-intro">Check your Stripe receipt for payment details.</p>
    <p class="form-note">Need help with an order? Email <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>.</p>
    <a class="button" href="/">Back to home <ArrowIcon /></a>
  </main>;
}
