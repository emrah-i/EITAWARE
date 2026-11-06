import { createSignal, createUniqueId, type JSX } from 'solid-js';

export const UNAVAILABLE_MESSAGE = 'Direct checkout is currently unavailable.';

/** Focusable wrapper keeps the explanation accessible around a native disabled button. */
export default function PurchaseButton(props: {
  disabled: boolean; loading?: boolean; busy?: boolean; href?: string;
  type?: 'button' | 'submit'; onClick?: () => void;
  class?: string; wrapperClass?: string; children: JSX.Element;
}) {
  const id = createUniqueId();
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);
  const open = () => (hovered() || focused()) && !dismissed();
  const explanation = () => props.loading ? 'Checking availability…' : props.busy ? 'Opening secure checkout…' : UNAVAILABLE_MESSAGE;
  return <span class={`purchase-control ${props.wrapperClass || ''}`} tabindex={props.disabled ? 0 : undefined}
    aria-label={props.disabled ? 'Purchase unavailable' : undefined} aria-describedby={props.disabled ? id : undefined}
    onMouseEnter={() => { setHovered(true); setDismissed(false); }} onMouseLeave={() => setHovered(false)}
    onFocusIn={() => { setFocused(true); setDismissed(false); }} onFocusOut={() => setFocused(false)}
    onKeyDown={event => { if (event.key === 'Escape') { setDismissed(true); event.stopPropagation(); } }}>
    <button class={`button ${props.class || ''}`} type={props.type || 'button'} disabled={props.disabled}
      aria-describedby={props.disabled ? id : undefined}
      onClick={() => { if (props.disabled) return; if (props.href) window.location.assign(props.href); else props.onClick?.(); }}>{props.children}</button>
    <span id={id} role="tooltip" class="purchase-tooltip" hidden={!props.disabled || !open()}>{explanation()}</span>
  </span>;
}
