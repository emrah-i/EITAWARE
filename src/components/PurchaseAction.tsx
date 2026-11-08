import { Show, type JSX } from 'solid-js';
import type { CatalogProduct } from '../shared/catalog';
import { stripePaymentLink } from '../shared/payments';

/** Links work without hydration; native disabled buttons cannot start a payment. */
export default function PurchaseAction(props: { product: CatalogProduct; class?: string; children: JSX.Element }) {
  return <Show when={props.product.status === 'sold-out'} fallback={
    <Show when={stripePaymentLink(props.product)}>{href => <a class={`button purchase-action ${props.class || ''}`} href={href()}>{props.children}</a>}</Show>
  }>
    <button class={`button purchase-action ${props.class || ''}`} type="button" disabled>Sold out</button>
  </Show>;
}
