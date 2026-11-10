import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist/client');
const serverEntry = join(root, 'dist/server/entry-server.js');
async function filesIn(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(item => item.isDirectory() ? filesIn(join(path, item.name)) : join(path, item.name)))).flat();
}
const inputs = [
  ...await filesIn(join(root, 'src/components')), ...await filesIn(join(root, 'src/pages')),
  ...await filesIn(join(root, 'src/shared')), ...await filesIn(join(root, 'src/content')),
  ...await filesIn(join(root, 'src/lib')),
  ...['src/App.tsx', 'src/styles.css', 'src/entry-client.tsx', 'src/entry-server.tsx', 'scripts/prerender.mjs'].map(path => join(root, path)),
];
const newestInput = Math.max(...await Promise.all(inputs.map(async path => (await stat(path)).mtimeMs)));
const oldestOutput = Math.min((await stat(serverEntry)).mtimeMs, (await stat(join(output, 'index.html'))).mtimeMs);
assert.ok(oldestOutput >= newestInput, 'The built storefront is stale. Run npm run build before this verification.');

const { CATALOG, PUBLISHED_PRODUCTS, routes, renderPage, AMAZON_PLACEMENTS, amazonUrl, stripePaymentLink } = await import(pathToFileURL(serverEntry).href);
const current = CATALOG.products.find(product => product.id === 'eitaware-dark-blue-12');
const currentPaymentLink = stripePaymentLink(current);
assert.equal(current.status, 'available');
assert.ok(currentPaymentLink, 'The Dark Blue set must remain available with its own Payment Link.');
assert.equal(current?.priceCents, 7999, 'The current dinnerware offer must be $79.99 per set.');
const productRoute = `/products/${current.slug}`;
const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#39|#x27);/g, entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&#x27;': "'", '&lt;': '<', '&gt;': '>' })[entity]);
const text = html => decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const attributes = markup => Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], decode(match[2])]));
const links = html => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({ ...attributes(match[1]), text: text(match[2]) }));
const hasClass = (element, name) => element?.class?.split(/\s+/).includes(name);
const pageFile = route => join(output, route === '/' ? 'index.html' : route === '/404' ? '404.html' : `${route.slice(1)}/index.html`);
const pages = new Map(await Promise.all(routes.map(async route => [route, await readFile(pageFile(route), 'utf8')])));
const home = pages.get('/');
const product = pages.get(productRoute);
assert.ok(product, 'The current product needs a prerendered detail page.');

for (const route of ['/', '/products', productRoute]) {
  assert.match(text(pages.get(route)), /\$79\.99\b/, `${route} must display the current price.`);
}
for (const [route, html] of pages) {
  assert.doesNotMatch(text(html), /\$(?:99\.99|69\.99|99\.00)\b|\$99(?![\d.])/, `${route} still displays an old price.`);
  assert.doesNotMatch(text(html), /\b01\s*\/\s*01\b/, `${route} still displays the obsolete single-item counter.`);
  assert.doesNotMatch(text(html), /terms of sale|deep blue/i, `${route} contains superseded customer-facing copy.`);
  assert.doesNotMatch(text(html), /shop the set/i, `${route} contains the obsolete purchase label.`);
  for (const heading of html.matchAll(/<h[123]\b[^>]*>([\s\S]*?)<\/h[123]>/g)) {
    assert.doesNotMatch(text(heading[1]), /\.$/, `${route} has a heading with an obsolete trailing period.`);
    assert.doesNotMatch(text(heading[1]), /—/, `${route} has a heading with an em dash.`);
  }
  for (const eyebrow of html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    if (hasClass(attributes(eyebrow[1]), 'eyebrow')) {
      assert.doesNotMatch(text(eyebrow[2]), /\.$/, `${route} has an eyebrow with an obsolete trailing period.`);
      assert.doesNotMatch(text(eyebrow[2]), /—/, `${route} has an eyebrow with an em dash.`);
    }
  }
  assert.doesNotMatch(text(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''), /—/, `${route} has a browser title with an em dash.`);
  const header = html.match(/<header\b[^>]*class="site-header"[^>]*>([\s\S]*?)<\/header>/)?.[1];
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
  for (const [name, markup] of [['header', header], ['footer', footer]]) {
    assert.ok(markup, `${route} needs its ${name}.`);
    const wordmark = markup.match(/<(?:span|strong|a)\b([^>]*\bclass="[^"]*\bbrand-wordmark\b[^"]*"[^>]*)>([\s\S]*?)<\/(?:span|strong|a)>/);
    assert.equal(text(wordmark?.[2] || ''), 'EITAWARE', `${route} needs a live-text ${name} wordmark.`);
    assert.doesNotMatch(markup, /<img\b[^>]*src="\/images\/logo\.png"/, `${route} still uses the raster wordmark in its ${name}.`);
  }
  const footerSlogan = footer.match(/<p\b[^>]*class="footer-slogan"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(footerSlogan, `${route} needs the two-line footer slogan.`);
  assert.deepEqual([...footerSlogan.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map(match => text(match[1])), ['Simple Elegance,', 'Beautifully Served']);
  assert.equal([...footerSlogan.matchAll(/<br\s*\/?\s*>/g)].length, 1, `${route} needs an explicit footer slogan line break.`);
}
const images = html => [...html.matchAll(/<img\b([^>]*)>/g)].map(match => attributes(match[1]));
for (const [route, html] of pages) for (const photo of images(html)) {
  assert.equal(photo.decoding, 'async', `${route} needs asynchronous photo decoding.`);
  assert.ok(Number(photo.width) > 0 && Number(photo.height) > 0, `${route} needs reserved image dimensions.`);
}
const homePhotos = images(home);
assert.equal(homePhotos[0].loading, 'eager');
assert.equal(homePhotos[0].fetchpriority, 'high');
assert.ok(homePhotos.slice(1).every(photo => photo.loading === 'lazy'), 'Off-screen homepage photos must remain lazy.');
const collectionPhotos = images(pages.get('/products'));
assert.equal(collectionPhotos[0].loading, 'eager');
assert.ok(collectionPhotos[0].srcset, 'The first catalog photo needs responsive sources.');
assert.ok(collectionPhotos.slice(1).every(photo => photo.loading === 'lazy'));
const productPhotos = images(product);
assert.equal(productPhotos[0].loading, 'eager');
assert.equal(productPhotos[0].fetchpriority, 'high');
assert.ok(productPhotos.slice(1).every(photo => photo.loading === 'lazy'), 'Gallery thumbnails must stay lazy.');

const jsonLd = [...product.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const offer = jsonLd.find(item => item['@type'] === 'Product')?.offers;
assert.deepEqual({ price: offer?.price, currency: offer?.priceCurrency, url: offer?.url }, { price: '79.99', currency: 'USD', url: `https://eitaware.com${productRoute}` });
assert.equal(JSON.parse(renderPage(productRoute).structuredData).offers.price, '79.99', 'Server-rendered offer and saved HTML must agree.');

const amazonSource = await readFile(join(root, 'src/shared/amazon.ts'), 'utf8');
const mainAmazonUrl = amazonSource.match(/export const AMAZON_URL\s*=\s*['"]([^'"]+)['"]/u)?.[1];
const expectedAmazonUrl = 'https://www.amazon.com/dp/B0H8X1MSP5?maas=maas_adg_24A2C9F4135E9FCE114E5166E9516EB1_afap_abs&ref_=aa_maas&tag=maas';
assert.equal(mainAmazonUrl, expectedAmazonUrl, 'The main Amazon constant must preserve the exact supplied attribution URL.');
for (const placement of AMAZON_PLACEMENTS) assert.equal(amazonUrl(placement), expectedAmazonUrl, `${placement} must use the exact supplied attribution URL.`);
let amazonLinkCount = 0;
for (const [route, html] of pages) {
  for (const link of links(html).filter(link => /^https:\/\/(?:www\.)?amazon\.com\//.test(link.href || ''))) {
    amazonLinkCount++;
    assert.equal(link.href, expectedAmazonUrl, `${route} must preserve the exact supplied Amazon Attribution URL after HTML entity decoding.`);
    const rel = (link.rel || '').split(/\s+/);
    assert.ok(rel.includes('noopener'), `${route}: Amazon links need noopener.`);
    assert.ok(!rel.some(value => ['noreferrer', 'nofollow', 'sponsored'].includes(value)), `${route}: Amazon link rel would suppress or alter the approved attribution behavior.`);
    assert.equal(link.target, '_blank');
  }
  for (const link of links(html).filter(link => link.href === '/terms')) assert.equal(link.text.toLowerCase(), 'terms of service', `${route} has an inconsistent terms link label.`);
}
assert.ok(amazonLinkCount >= 15, 'Expected repeated Amazon placements across the public storefront.');

for (const [route, count] of [['/', 0], [productRoute, 1], ['/contact', 1]]) {
  const shoppingLinks = links(pages.get(route)).filter(link => hasClass(link, 'amazon-cta'));
  assert.equal(shoppingLinks.length, count, `${route} has the wrong number of highlighted Amazon shopping actions.`);
  for (const link of shoppingLinks) {
    assert.equal(link.href, expectedAmazonUrl);
    assert.ok(!hasClass(link, 'button'), `${route} must reserve the filled primary button class for direct shopping.`);
  }
}
for (const [route, html] of pages) {
  for (const region of html.matchAll(/<(?:header|footer|nav)\b([^>]*)>([\s\S]*?)<\/(?:header|footer|nav)>/g)) {
    if (hasClass(attributes(region[1]), 'site-header') || region[0].startsWith('<footer')) {
      assert.ok(!links(region[2]).some(link => hasClass(link, 'amazon-cta')), `${route} must keep navigation/footer Amazon links quiet.`);
    }
  }
  for (const markup of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    assert.ok(!markup[1].includes('maas_adg_'), `${route} must keep the Amazon attribution URL out of the site's own structured data.`);
  }
}


const guarantee = {
  headline: "Arrives perfect, or it's on us.",
  text: "If any piece arrives broken, you must email support@eitaware.com within 7 days of delivery with your order reference and an in-depth video clearly showing the set, all damaged pieces, and the packaging. We'll send a brand-new replacement set at no cost or provide a full refund. No need to ship anything back.",
  qualification: 'Applies to orders placed on eitaware.com.', href: '/shipping-returns#arrives-perfect',
};
for (const [route, html] of [['/', home], [productRoute, product], ['/shipping-returns', pages.get('/shipping-returns')]]) {
  assert.ok(text(html).includes(guarantee.text), `${route} must retain the exact replacement/refund promise.`);
  assert.ok(text(html).includes(guarantee.qualification), `${route} must qualify the promise as website orders.`);
}
const purchaseLinks = links(product);
const directMarkup = [...product.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(match => hasClass(attributes(match[1]), 'product-buy'));
const direct = directMarkup && { ...attributes(directMarkup[1]), text: text(directMarkup[2]) };
const amazon = purchaseLinks.find(link => hasClass(link, 'amazon-product'));
const guaranteeLink = purchaseLinks.find(link => hasClass(link, 'purchase-guarantee'));
assert.equal(direct?.href, currentPaymentLink, 'Direct purchase must use its product Payment Link in prerendered HTML.');
assert.equal(direct?.text, 'Buy now — $79.99');
assert.ok(hasClass(direct, 'button') && !hasClass(direct, 'button-secondary'), 'Direct purchase must be the primary action.');
assert.ok(hasClass(amazon, 'amazon-cta') && !hasClass(amazon, 'button'), 'Amazon must keep its yellow CTA treatment without taking the primary purchase class.');
assert.ok(product.indexOf('product-buy') < product.indexOf('purchase-guarantee') && product.indexOf('purchase-guarantee') < product.indexOf('amazon-product'), 'The guarantee belongs directly below direct purchase and above Amazon.');
assert.deepEqual({ href: guaranteeLink?.href, text: guaranteeLink?.text }, { href: guarantee.href, text: guarantee.headline });
assert.match(pages.get('/shipping-returns'), /id="arrives-perfect"/);
assert.ok(links(pages.get('/terms')).some(link => link.href === guarantee.href), 'Terms must link to the guarantee.');

const featureLabels = ['Dishwasher safe', 'Microwave safe', 'Easy to stack', 'Lead-free', 'Third-party tested', 'Refrigerator safe'];
assert.deepEqual(current.careHighlights.map(item => item.label), featureLabels, 'The featured set needs the six approved care/product features.');
const careStrip = home.match(/<section\b[^>]*class="care-strip"[^>]*>([\s\S]*?)<\/section>/)?.[1];
assert.ok(careStrip, 'The homepage needs its feature banner.');
const renderedFeatureLabels = [...careStrip.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map(match => text(match[1]));
assert.deepEqual(renderedFeatureLabels, featureLabels, 'The feature banner must display the six approved labels.');
const slogan = 'Simple elegance, beautifully served';
assert.ok(text(home).includes(slogan), 'The homepage must retain the supplied hero slogan.');
assert.ok(home.indexOf(slogan) < home.indexOf('<h1'), 'The homepage slogan must precede the hero heading.');
assert.ok(text(product).includes('Quality controlled'), 'The product page needs the supplied quality note.');

const headings = html => [...html.matchAll(/<h[123]\b[^>]*>([\s\S]*?)<\/h[123]>/g)].map(match => text(match[1]));
for (const heading of ['An effortlessly elegant table', 'A beautiful table starts here', 'Every meal beautifully served', 'A complete setting for four', 'Your questions answered', 'Bring understated elegance home']) {
  assert.ok(headings(home).includes(heading), `The homepage needs its approved heading: ${heading}.`);
}
assert.doesNotMatch(home, /class="[^"]*\bhome-intro\b[^"]*"/, 'The standalone homepage intro must be removed.');
assert.ok(!text(home).includes('Rich color, considered details'), 'The old standalone homepage intro copy must be removed.');
for (const eyebrow of ['The collection', 'For hosting and everyday use', 'Twelve pieces, Service for four', 'Before you order', 'The finishing touch']) {
  assert.ok([...home.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)].some(match => hasClass(attributes(match[1]), 'eyebrow') && text(match[2]) === eyebrow), `The homepage needs its approved eyebrow: ${eyebrow}.`);
}
assert.ok(headings(pages.get('/products')).includes('Stoneware with distinctive character'), 'The collection needs its approved heading.');
assert.ok(headings(product).includes('Set your table with confidence'), 'The product closing section needs its approved heading.');
assert.doesNotMatch(home, /class="[^"]*\btiny-line\b[^"]*"/, 'The intro divider must be removed.');


const faq = pages.get('/faq');
assert.ok(faq, 'The FAQ needs a prerendered public page.');
const faqMain = faq.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
assert.ok(faqMain, 'The FAQ needs an accessible main region.');
assert.equal([...faqMain.matchAll(/<details\b/g)].length, 10, 'The FAQ needs ten expandable answers.');
assert.equal([...faqMain.matchAll(/<summary\b/g)].length, 10, 'Every FAQ answer needs its own named disclosure.');
assert.deepEqual([...faqMain.matchAll(/<details\b([^>]*)>/g)].map(match => attributes(match[1]).id), ['food-safe', 'included', 'dishwasher', 'microwave', 'shipping', 'broken-arrivals', 'returns', 'refrigerator', 'glaze', 'temperature'], 'FAQ answers must follow the approved shopping/support order.');
assert.match(faq, /<title>EITAWARE \| FAQ<\/title>/);
assert.ok([...faq.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0])).some(item => item.name === 'description' && item.content?.length > 50), 'FAQ metadata must describe its useful content.');
assert.ok(links(faq).some(link => link.href === 'mailto:support@eitaware.com'), 'The FAQ must link to support.');
assert.ok(text(faqMain).includes(guarantee.text) && text(faqMain).includes(guarantee.qualification), 'The FAQ must retain the exact scoped full-set replacement/refund promise.');
assert.ok(links(faqMain).some(link => link.href === guarantee.href), 'The FAQ must link to the guarantee policy.');
assert.match(faq, /<link\b[^>]*rel="canonical"[^>]*href="https:\/\/eitaware\.com\/faq"/);
assert.match(await readFile(join(output, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/eitaware\.com\/faq<\/loc>/);
for (const [name, markup] of [['desktop navigation', home.match(/<nav\b[^>]*class="desktop-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]], ['footer', home.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1]]]) {
  assert.ok(markup && links(markup).some(link => link.href === '/faq'), `The ${name} must link to the FAQ.`);
}


// Check explicit reveal boundaries in the HTML rather than relying on a selector list.
// A batch marker is one logical group whose direct children animate together.
// The batch container itself is not animated and must not be mistaken for a nested target.
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
let revealGroupCount = 0;
for (const [route, html] of pages) {
  const stack = [];
  let pageGroupCount = 0;
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const token of markup.matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const [, closing, rawTag, rawAttributes] = token;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = stack.findLastIndex(item => item.tag === tag);
      if (index !== -1) stack.splice(index);
      continue;
    }
    const attrs = attributes(rawAttributes);
    const explicit = /\bdata-reveal-group(?:\s|=|$)/.test(rawAttributes);
    const children = /\bdata-reveal-children(?:\s|=|$)/.test(rawAttributes);
    const group = (explicit && !children) || !!stack.at(-1)?.children;
    if (explicit || children) {
      pageGroupCount++;
      assert.ok(!stack.some(item => item.explicit || item.children || item.group), `${route} contains nested reveal markers.`);
    }
    if (group) {
      assert.ok(!stack.some(item => item.group), `${route} contains nested animated reveal targets.`);
      assert.ok(!['body', 'main', 'nav'].includes(tag), `${route} must not animate a whole page or navigation surface.`);
      const steady = item => item.tag === 'nav' || ['alert', 'status'].includes(item.attrs.role) || ['site-header', 'announcement', 'mobile-purchase-bar'].some(name => hasClass(item.attrs, name));
      assert.ok(!steady({ tag, attrs }) && !stack.some(steady), `${route} must leave navigation, fixed controls, and status feedback steady.`);
      assert.doesNotMatch(attrs.style || '', /opacity\s*:\s*0(?:[;\s]|$)|visibility\s*:\s*hidden/, `${route} has a reveal group hidden in the initial HTML.`);
    }
    if (!voidTags.has(tag) && !/\/\s*$/.test(rawAttributes)) stack.push({ tag, attrs, group, explicit, children });
  }
  revealGroupCount += pageGroupCount;
  if (['/', '/products', productRoute, '/faq', '/contact', '/shipping-returns', '/privacy', '/terms'].includes(route)) {
    assert.ok(pageGroupCount > 0, `${route} needs explicit complete-content reveal groups.`);
  }
}

const thumbnailMarkup = product.match(/<div class="gallery-thumbnails"[^>]*>([\s\S]*?)<\/div>/)?.[1];
assert.ok(thumbnailMarkup, 'The product needs its image/video thumbnail gallery.');
const thumbnailImages = [...thumbnailMarkup.matchAll(/<img\b([^>]*)>/g)].map(match => attributes(match[1]));
assert.equal(thumbnailImages.length, 8);
assert.deepEqual(thumbnailImages.map(item => item.alt), current.gallery.map(item => item.thumbnailAlt));
assert.ok(thumbnailImages.every(item => item.alt?.trim()), 'All eight thumbnails need descriptive alternatives.');
for (const route of ['/privacy', '/terms']) assert.ok(text(pages.get(route)).includes('Last updated: November 2026'), `${route} needs the approved update date.`);
assert.match(pages.get('/terms'), /<title>EITAWARE \| Terms of Service<\/title>/);
assert.equal(text(pages.get('/terms').match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || ''), 'Terms of service');

console.log(`Verified ${pages.size} built routes: $79.99 offer, JSON-LD, ${amazonLinkCount} exact Attribution links, two yellow shopping CTAs, neutral homepage/product-closing Amazon links, ${revealGroupCount} non-nested reveal groups, full-set guarantee placement/qualification, FAQ, six feature labels, live-text wordmarks, two-line footer slogan, approved headings/quality note, terms copy/dates, direct purchase hierarchy, and eight descriptive thumbnails.`);

// Public text separators, email links, accordion labels, and homepage promotions.
for (const [route, html] of pages) {
  assert.doesNotMatch(text(html), /[·•]/, `${route} contains a decorative dot separator.`);
  const withoutMailLinks = html.replace(/<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g, '');
  assert.doesNotMatch(text(withoutMailLinks), /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${route} has an unlinked visible email address.`);
}
assert.doesNotMatch(home, /hero-amazon|featured-amazon/);
const closingAmazon = links(home).find(link => hasClass(link, 'amazon-link'));
assert.equal(closingAmazon?.href, expectedAmazonUrl);
assert.equal(closingAmazon?.text, 'Shop on Amazon');
assert.doesNotMatch(text(home), /Can I buy (?:this|the) set on Amazon\?/, 'The homepage must omit the Amazon FAQ question.');
assert.ok(!links(home).some(link => link.text === 'Amazon listing'), 'The removed FAQ answer must not leave its Amazon link behind.');
const productSummaries = [...product.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].map(match => text(match[1]).replace(/\s*\+$/, ''));
assert.deepEqual(productSummaries, ['What’s Included', 'Details & Care', 'Delivery & Support']);
const styles = await readFile(join(root, 'src/styles.css'), 'utf8');
assert.match(styles, /a\[href\^="mailto:"\]\s*\{[^}]*text-decoration:\s*underline/);
assert.match(styles, /content-enter 500ms ease-in-out/);
assert.match(styles, /\.featured-image\s*\{[^}]*background:\s*#fff/);
assert.doesNotMatch(styles, /content:\s*['"][·•]['"]/);
console.log('Verified title-case product accordions, no decorative separators, linked emails, white featured panel, plain homepage Amazon links, and synchronized 500ms CSS fade.');

assert.doesNotMatch(text(faqMain), /The Everyday Set|12 pieces for four|The Dark Blue finish/, 'The FAQ must address all sets rather than one product.');
assert.ok(text(faqMain).includes('Yes. All our dinnerware sets are food safe.'), 'The FAQ must state the owner-supplied food-safety information for all sets.');
assert.ok(links(faqMain).some(link => link.href === '/products'), 'Set-specific contents and dimensions must point to the collection.');

assert.ok(links(product).some(link => link.text === "Or shop on Amazon" && hasClass(link, "amazon-link") && !hasClass(link, "amazon-cta")), "The product closing Amazon link must match the plain homepage link.");

const contactMain = pages.get('/contact').match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
assert.doesNotMatch(text(contactMain), /Prefer email|M Sqware LLC|Maryland|United States/, 'The contact page must omit duplicate email prompts and company/location details.');
for (const [route, html] of pages) {
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1] || '';
  assert.doesNotMatch(text(footer), /Maryland, USA/);
  for (const [href, label] of [['/products', 'Our Collection'], ['/contact', 'Contact'], ['/shipping-returns', 'Shipping and Returns'], ['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service']]) {
    assert.ok(links(footer).some(link => link.href === href && link.text === label), `${route}: footer needs title-case ${label}.`);
  }
}

for (const [route, html] of pages) {
  const announcement = html.match(/<div\b[^>]*class="announcement"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
  assert.ok(links(announcement).some(link => hasClass(link, 'announcement-link') && link.href === '/products'), `${route} needs an announcement shopping link.`);
  assert.match(announcement, /<button\b[^>]*aria-label="Dismiss announcement"/);
  const bannerAnchor = announcement.match(/<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1] || '';
  assert.doesNotMatch(bannerAnchor, /<button/, 'Dismiss must remain separate from the banner link.');
}
const careDisclosure = [...product.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/g)].find(match => text(match[0]).startsWith('Details & Care'))?.[0];
assert.ok(careDisclosure && text(careDisclosure).includes('Quality controlled'), 'Quality controlled belongs inside Details & Care.');
assert.doesNotMatch(product.replace(careDisclosure, ''), /Quality controlled|quality-note/, 'Quality controlled must not remain outside its disclosure.');

for (const statement of [
  'All our products are third-party tested, quality controlled, and lead-free.',
  'Yes. All our products are dishwasher safe.',
  'Yes. All our products are microwave safe.',
  'Yes. All our products are refrigerator safe.',
]) assert.ok(text(faqMain).includes(statement), `The FAQ must retain the supplier-confirmed statement: ${statement}`);

const requiredVideo = 'an in-depth video clearly showing the set, all damaged pieces, and the packaging';
for (const route of ['/', productRoute, '/faq', '/shipping-returns', '/terms']) {
  const html = pages.get(route);
  assert.ok(text(html).includes(requiredVideo), `${route} must require the agreed video evidence.`);
  assert.doesNotMatch(text(html), /with a photo|send (?:us )?(?:a )?photos?|photo evidence/i, `${route} still requests photo evidence.`);
}
assert.ok(text(pages.get('/terms')).includes('Broken-arrival guarantee claims require ' + requiredVideo), 'Terms must explicitly require video for broken-arrival guarantee claims.');

assert.ok(text(pages.get('/privacy')).includes('video evidence showing the set, all damaged pieces, and the packaging'), 'Privacy must describe video evidence collected for guarantee claims.');

for (const id of ['contact-name', 'contact-email', 'contact-subject', 'contact-message']) {
  const markup = pages.get('/contact').match(new RegExp(`<(?:input|textarea)\\b[^>]*id="${id}"[^>]*>`));
  assert.ok(markup && attributes(markup[0]).placeholder, `${id} needs a helpful placeholder.`);
}
assert.match(await readFile(join(root, 'src/styles.css'), 'utf8'), /\.gallery-thumbnails img[^}]*object-fit: cover/, 'Thumbnails must crop into uniform frames.');
console.log('Verified plain purchase anchors, contact placeholders, and cropped thumbnails.');

assert.match(styles, /\.gallery-main > img\s*\{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: contain/, 'Main product images must remain complete inside the stable frame.');
assert.match(styles, /\.gallery-thumbnails img\s*\{[^}]*aspect-ratio: 7 \/ 5;[^}]*object-fit: cover/, 'Thumbnails need consistent 7:5 cropped previews.');
assert.match(styles, /\.gallery-main\s*\{[^}]*aspect-ratio: 1;/, 'Main gallery needs a stable square frame.');
assert.ok(!styles.includes('--gallery-preview-height'), 'Sticky behavior must not resize the fixed square frame.');
console.log('Verified stable square main frame, complete main images, and cropped 7:5 thumbnails.');

const captionMarkup = product.match(/<div\b[^>]*class="gallery-captions"[^>]*>([\s\S]*?)<\/div>/)?.[1];
const expectedCaptions = current.gallery.filter(item => item.type === 'video' && item.caption).map(item => item.caption);
assert.ok(captionMarkup, 'Video captions need a reserved layout track.');
assert.deepEqual([...captionMarkup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match => text(match[1])), expectedCaptions);
assert.equal([...captionMarkup.matchAll(/aria-hidden="true"/g)].length, expectedCaptions.length, 'No video caption should be exposed while the initial photo is selected.');
assert.match(styles, /\.gallery-captions\s*\{[^}]*display: grid/);
assert.match(styles, /\.gallery-captions \.gallery-note\s*\{[^}]*grid-area: 1 \/ 1;[^}]*visibility: hidden/);
console.log('Verified caption space reservation and inactive-caption accessibility.');

const pageNames = {
  '/': 'Simple elegance, beautifully served', '/products': 'Products', '/contact': 'Contact',
  '/faq': 'FAQ', '/order-confirmation': 'Thank You',
  '/shipping-returns': 'Shipping and Returns', '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service', '/404': 'Page Not Found',
};
for (const [route, html] of pages) {
  const catalogProduct = CATALOG.products.find(item => `/products/${item.slug}` === route);
  const pageName = catalogProduct ? `${catalogProduct.name}${catalogProduct.status === 'coming-soon' ? ' (Coming soon)' : ''}` : pageNames[route];
  const expectedTitle = `EITAWARE | ${pageName}`;
  assert.equal(text(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''), expectedTitle, `${route} needs its brand-first browser title.`);
  const openGraphTitle = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0])).find(meta => meta.property === 'og:title');
  assert.equal(openGraphTitle?.content, expectedTitle, `${route} needs a matching social-sharing title.`);
  if (route !== '/') assert.ok(!expectedTitle.includes(pageNames['/']), 'Only the homepage should use the slogan as its title.');
}
assert.equal(renderPage('/not-a-page').title, 'EITAWARE | Page Not Found');
console.log('Verified brand-first titles on every route, homepage-only slogan, page names, and matching Open Graph titles.');

// Purchase links must already work in the saved HTML without hydration.
for (const [route, html] of pages) {
  for (const link of links(html).filter(link => /^buy now\b/i.test(link.text))) {
    assert.ok(CATALOG.products.some(item => stripePaymentLink(item) === link.href), `${route} must use a configured product Payment Link.`);
    assert.ok(!link.target || link.target === '_self', `${route} must keep purchases in the same tab.`);
  }
  assert.ok(!links(html).some(link => /^\/checkout(?:[/?#]|$)/.test(link.href || '')), `${route} still links into the old checkout.`);
}
assert.equal(links(home).filter(link => link.href === currentPaymentLink).length, 1);
assert.deepEqual(links(pages.get('/products')).filter(link => hasClass(link, 'purchase-action')).map(link => link.href), CATALOG.products.filter(item => item.status === 'available').map(stripePaymentLink));
assert.equal(links(product).filter(link => link.href === currentPaymentLink).length, 3);
assert.doesNotMatch(product, /product-quantity|purchase-tooltip|purchase-control/);
assert.ok(!routes.includes('/checkout'));
const thankYou = pages.get('/order-confirmation');
assert.match(thankYou, /name="robots" content="noindex, nofollow"/);
assert.ok(links(thankYou).some(link => link.href === '/' && link.text === 'Back to home'));
assert.doesNotMatch(thankYou, /Payment confirmed|Confirming your order|Check status again/);
assert.equal(text(thankYou.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] || ''), 'Thank you for choosing us');
const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
assert.doesNotMatch(sitemap, /checkout|order-confirmation/);
// Exercise catalog states against real server-rendered HTML, without hydration.
const purchaseActions = html => links(html).filter(link => hasClass(link, 'purchase-action'));
function soldOutButtons(html, count) {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(match => hasClass(attributes(match[1]), 'purchase-action'));
  assert.equal(buttons.length, count, 'Sold-out purchase controls must remain visible.');
  for (const [, markup, contents] of buttons) {
    assert.match(markup, /\bdisabled(?:[\s=>]|$)/);
    assert.equal(attributes(markup).type, 'button');
    assert.ok(!('href' in attributes(markup)));
    assert.equal(text(contents), 'Sold out');
    assert.doesNotMatch(contents, /<svg/);
  }
}
const savedProduct = structuredClone(current);
const second = { ...structuredClone(current), id: 'verification-second-set', slug: 'verification-second-set', name: 'A second set', priceCents: 8999, payments: { stripePaymentLink: 'https://buy.stripe.com/test_second_set' } };
const draft = { ...structuredClone(second), id: 'verification-draft', slug: 'verification-draft', status: 'draft' };
const originalCatalogLength = CATALOG.products.length;
const originalPublishedLength = PUBLISHED_PRODUCTS.length;
try {
  CATALOG.products.push(second, draft);
  PUBLISHED_PRODUCTS.push(second);
  const firstPage = renderPage(productRoute);
  const secondPage = renderPage(`/products/${second.slug}`);
  assert.equal(JSON.parse(firstPage.structuredData).offers.availability, 'https://schema.org/InStock');
  assert.deepEqual(purchaseActions(firstPage.html).map(link => link.href), Array(3).fill(currentPaymentLink));
  assert.deepEqual(purchaseActions(secondPage.html).map(link => link.href), Array(3).fill(second.payments.stripePaymentLink));
  assert.deepEqual(purchaseActions(renderPage('/products').html).map(link => link.href), [currentPaymentLink, second.payments.stripePaymentLink]);
  assert.equal(purchaseActions(renderPage(`/products/${draft.slug}`).html).length, 0);

  current.status = 'sold-out';
  const soldOutDetail = renderPage(productRoute);
  assert.equal(purchaseActions(soldOutDetail.html).length, 0);
  soldOutButtons(soldOutDetail.html, 3);
  assert.match(text(soldOutDetail.html), /\$79\.99/);
  assert.equal(JSON.parse(soldOutDetail.structuredData).offers.availability, 'https://schema.org/OutOfStock');
  soldOutButtons(renderPage('/products').html, 1);
  soldOutButtons(renderPage('/').html, 1);
  assert.equal(purchaseActions(renderPage('/').html).length, 0, 'A sold-out homepage must not link to payment.');
  assert.ok(links(soldOutDetail.html).some(link => link.href === expectedAmazonUrl), 'Sold-out products retain their Amazon links.');
  // No URL is necessary while sold out; controls and metadata stay visible.
  delete current.payments;
  soldOutButtons(renderPage(productRoute).html, 3);

  current.status = 'coming-soon';
  current.whatToExpect = 'A future collection preview.';
  const preview = renderPage(productRoute);
  assert.equal(purchaseActions(preview.html).length, 0);
  soldOutButtons(preview.html, 0);
  assert.match(text(preview.html), /Coming soon/);
  assert.ok(!JSON.parse(preview.structuredData).offers);
} finally {
  CATALOG.products.length = originalCatalogLength;
  PUBLISHED_PRODUCTS.length = originalPublishedLength;
  for (const key of Object.keys(current)) if (!(key in savedProduct)) delete current[key];
  Object.assign(current, savedProduct);
}
console.log('Verified product-specific Payment Links, visible native Sold out buttons across all five placements, stock metadata, draft/coming-soon exclusion, and the static thank-you page.');
