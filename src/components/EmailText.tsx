import { For } from 'solid-js';
import { splitEmailText } from '../shared/email-text';

export default function EmailText(props: { text: string }) {
  return <For each={splitEmailText(props.text)}>{part => typeof part === 'string' ? part : <a href={`mailto:${part.email}`}>{part.email}</a>}</For>;
}
