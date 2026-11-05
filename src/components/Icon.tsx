import type { JSX } from 'solid-js';

export function ArrowIcon(props: { class?: string; diagonal?: boolean }) {
  return <svg class={props.class} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={props.diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}

export function CareIcon(props: { kind: 'dishwasher' | 'microwave' | 'stack'; class?: string }) {
  const paths: Record<typeof props.kind, JSX.Element> = {
    dishwasher: <><rect x="5" y="3" width="22" height="26" rx="2"/><path d="M5 9h22M9 6h.01M12 6h.01M13 17v5m6-5v5M10 25h12M10 13l-1 2m7-2v2m6-2 1 2"/></>,
    microwave: <><rect x="3" y="7" width="26" height="19" rx="2"/><rect x="6" y="10" width="16" height="13" rx="1"/><path d="M25 12h1m-1 4h1m-1 4h1M10 20h8M12 13c-2 2 2 2 0 4m4-4c-2 2 2 2 0 4"/></>,
    stack: <><path d="M4 6h24c-1 5-5 8-12 8S5 11 4 6Zm0 8c2 5 6 8 12 8s10-3 12-8M4 22c2 5 6 8 12 8s10-3 12-8"/></>,
  };
  return <svg class={props.class} width="32" height="32" viewBox="0 0 32 34" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[props.kind]}</svg>;
}
