// Generate the app icon set from an inline SVG: terracotta coffee ring on ivory with an "M" monogram.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#F7F1E6"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <circle cx="256" cy="262" r="168" fill="none" stroke="#C0623B" stroke-width="30" stroke-dasharray="960 120" stroke-linecap="round" transform="rotate(-70 256 262)"/>
    <circle cx="256" cy="262" r="168" fill="none" stroke="#C0623B" stroke-opacity="0.22" stroke-width="30"/>
    <text x="256" y="322" text-anchor="middle" font-family="Georgia, 'Iowan Old Style', serif" font-weight="600" font-size="200" fill="#2B1D16">M</text>
    <circle cx="374" cy="128" r="16" fill="#8A9A7B"/>
  </g>
</svg>`;

await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/icon.svg', svg(0));
const out = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-512-maskable.png', 512, 0.2], // safe zone for maskable icons
  ['apple-touch-icon.png', 180, 0.04],
];
for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log(name);
}
