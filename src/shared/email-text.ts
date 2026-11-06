export type EmailTextPart = string | { email: string };

/** Separate email addresses without interpreting any caller-provided HTML. */
export function splitEmailText(text: string): EmailTextPart[] {
  const parts: EmailTextPart[] = [];
  const pattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > offset) parts.push(text.slice(offset, match.index));
    parts.push({ email: match[0] });
    offset = match.index! + match[0].length;
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return parts;
}
