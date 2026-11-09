import { describe, expect, it } from 'vitest';
import { splitEmailText } from '../src/shared/email-text';

describe('safe inline email text', () => {
  it.each(['', 'No email here. Price: $99.99. Bowl: 5.5 inches.'])('preserves ordinary copy: %s', text => {
    expect(splitEmailText(text).join('')).toBe(text);
  });
  it('links addresses while retaining surrounding punctuation and exact wording', () => {
    expect(splitEmailText('Email support@eitaware.com, or hello@example.com.')).toEqual([
      'Email ', { email: 'support@eitaware.com' }, ', or ', { email: 'hello@example.com' }, '.',
    ]);
  });
  it('supports plus tags, mixed case and subdomains', () => {
    expect(splitEmailText('Help+care@Updates.Example.com')).toEqual([{ email: 'Help+care@Updates.Example.com' }]);
  });
  it('treats HTML and URL-like text as plain text rather than markup', () => {
    expect(splitEmailText('<script>support@eitaware.com</script>')).toEqual(['<script>', { email: 'support@eitaware.com' }, '</script>']);
    expect(splitEmailText('javascript:alert(1)')).toEqual(['javascript:alert(1)']);
  });
});
