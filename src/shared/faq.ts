import { BRAND } from './catalog';
import { ARRIVES_PERFECT } from './guarantee';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  link?: { href: string; label: string };
  note?: string;
}

/** Supplier-confirmed product facts supplied by EITAWARE; care and policy details are shared with the store. */
export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'food-safe', question: 'Are your dinnerware sets food safe?',
    answer: 'Yes. All our dinnerware sets are food safe. All our products are third-party tested, quality controlled, and lead-free.',
  },
  {
    id: 'included', question: 'What is included, and what are the dimensions?',
    answer: 'Included pieces, service size, and dimensions are listed on each set’s product page. Browse our collection to find the details for your set.',
    link: { href: '/products', label: 'Explore our dinnerware sets' },
  },
  {
    id: 'dishwasher', question: 'Are your products dishwasher safe?',
    answer: 'Yes. All our products are dishwasher safe.',
  },
  {
    id: 'microwave', question: 'Are your products microwave safe?',
    answer: 'Yes. All our products are microwave safe. Use care when handling heated dinnerware.',
  },
  {
    id: 'shipping', question: 'Where do you ship, and when will my order be processed?',
    answer: 'We offer free standard shipping to the lower 48 states and Washington, D.C. Orders are normally processed within 1–2 business days. Delivery time depends on the destination and carrier; we email tracking details when available.',
    link: { href: '/shipping-returns', label: 'Shipping & returns' },
  },
  {
    id: 'broken-arrivals', question: 'What do I do if my set arrives broken?',
    answer: ARRIVES_PERFECT.text, note: ARRIVES_PERFECT.qualification,
    link: { href: ARRIVES_PERFECT.href, label: 'Read our arrives perfect guarantee' },
  },
  {
    id: 'returns', question: 'Can I return my dinnerware?',
    answer: `You may request a return within 30 days of delivery for unused sets in their original packaging. Email ${BRAND.supportEmail} with your order reference for authorization and instructions. The buyer pays return shipping unless the item arrived damaged or we sent the wrong item.`,
    link: { href: '/shipping-returns', label: 'Read the full returns policy' },
    note: 'These policies apply to orders placed on eitaware.com. For Amazon purchases, use your Amazon account for order and return support.',
  },  {
    id: 'refrigerator', question: 'Are your products refrigerator safe?',
    answer: 'Yes. All our products are refrigerator safe. Avoid sudden changes between hot and cold temperatures.',
  },
  {
    id: 'glaze', question: 'Will every piece have the same finish?',
    answer: 'For sets with a reactive glaze, color and pattern can vary between pieces; these variations are part of the finish. Check your set’s product page for finish details.',
  },
  {
    id: 'temperature', question: 'How should I handle temperature changes?',
    answer: 'Use care when moving dinnerware between hot and cold temperatures. Avoid sudden temperature changes, such as moving a chilled piece directly into heat.',
  },

];
