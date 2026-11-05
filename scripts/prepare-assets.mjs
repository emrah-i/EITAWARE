import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = process.env.EITAWARE_ASSET_ROOT || resolve('..', 'Listing', 'Listing');
const logo = process.env.EITAWARE_LOGO || resolve('..', 'Logos', 'EITAWARE.png');
mkdirSync('public/images', { recursive: true });
mkdirSync('public/videos', { recursive: true });
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Media optimization failed. Install ffmpeg and check the source paths.');
}
const images = [
  ['Pic 1.jpg','product-set'], ['Pic 2.png','includes'], ['Pic 3.png','sizes'],
  ['Pic 4.png','dining'], ['Pic 6.png','detail'], ['Pic 7.png','overhead'], ['Pic 8.png','table-setting'],
];
for (const [file, name] of images) {
  const input = resolve(source, file);
  if (!existsSync(input)) throw new Error(`Source asset is missing: ${input}`);
  ffmpeg(['-i', input, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '84', `public/images/${name}.webp`]);
  ffmpeg(['-i', input, '-vf', 'scale=640:-2', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', `public/images/${name}-640.webp`]);
}
copyFileSync(logo, 'public/images/logo.png');
for (const [file, name] of [['Video 1.mp4','table'],['Video 2.mp4','meal']]) {
  const input = resolve(source, file);
  ffmpeg(['-i', input, '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', `public/videos/${name}.mp4`]);
  ffmpeg(['-ss', '2', '-i', input, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', `public/images/video-${name}.webp`]);
}
console.log('Prepared web assets. Original source files were not changed.');
