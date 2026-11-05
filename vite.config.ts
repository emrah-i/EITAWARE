import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    {
      name: 'published-catalog-only',
      enforce: 'pre',
      transform(source, id, options) {
        if (!isSsrBuild && !options?.ssr && id.split('?')[0].endsWith('/src/content/catalog.json')) {
          const catalog = JSON.parse(source);
          // Draft content is never included in the browser's JavaScript bundle.
          return JSON.stringify({ ...catalog, products: catalog.products.filter((product: { status: string }) => product.status !== 'draft') });
        }
      },
    },
    solid({ ssr: true }), tailwindcss(),
  ],
  build: { outDir: 'dist/client', target: 'es2022' },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
}));
