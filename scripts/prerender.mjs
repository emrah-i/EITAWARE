import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { routes, renderPage, CATALOG } from '../dist/server/entry-server.js';

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
// Check every referenced local file, including drafts, before publishing any pages.
for (const product of CATALOG.products) {
  const assets = [product.image, ...product.gallery.flatMap(media => media.type === 'image' ? [media.src, media.thumbnail].filter(Boolean) : [media.src, media.poster])];
  for (const asset of new Set(assets)) {
    let file;
    try { file = await stat(join('public', asset.slice(1))); } catch { throw new Error(`Missing catalog asset for ${product.id}: ${asset}`); }
    if (!file.isFile() || !file.size) throw new Error(`Empty or invalid catalog asset: ${asset}`);
    if (!/\.(?:webp|png|jpe?g|avif|mp4)$/i.test(asset)) throw new Error(`Unsupported catalog media: ${asset}`);
  }
}
const template = await readFile('dist/client/index.html', 'utf8');
for (const route of routes) {
  const page = renderPage(route);
  const metadata = `<link rel="canonical" href="${page.canonical}" />\n<meta property="og:type" content="${page.type}" />\n<meta property="og:title" content="${escape(page.title)}" />\n<meta property="og:description" content="${escape(page.description)}" />\n<meta property="og:url" content="${page.canonical}" />\n<meta property="og:image" content="${escape(page.image)}" />\n<meta name="twitter:card" content="summary_large_image" />\n${page.noindex ? '<meta name="robots" content="noindex, nofollow" />' : ''}\n${page.structuredData ? `<script type="application/ld+json">${page.structuredData}</script>` : ''}`;
  const html = template.replace(/<title>.*?<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escape(page.description)}" />`)
    .replace('<!--page-head-->', metadata).replace('<!--app-html-->', page.html).replace('<!--hydration-script-->', page.hydration);
  const directory = route === '/' || route === '/404' ? 'dist/client' : join('dist/client', route.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, route === '/404' ? '404.html' : 'index.html'), html);
}
const publicRoutes = routes.filter(route => !['/checkout','/order-confirmation','/404'].includes(route));
await writeFile('dist/client/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicRoutes.map(route => `<url><loc>https://eitaware.com${route === '/' ? '' : route}</loc></url>`).join('')}</urlset>\n`);
await writeFile('dist/client/robots.txt', 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /checkout\nDisallow: /order-confirmation\nSitemap: https://eitaware.com/sitemap.xml\n');
console.log(`Prerendered ${routes.length} routes with canonical metadata and structured data.`);
