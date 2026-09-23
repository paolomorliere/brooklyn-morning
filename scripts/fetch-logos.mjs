// Downloads each team's logo once into public/logos/<slug>.webp.
//
//   node scripts/fetch-logos.mjs            fetch the ones we do not have yet
//   node scripts/fetch-logos.mjs --force    refetch everything
//
// Why the files live in the repo rather than being hotlinked: the screen then works offline, never
// shows a broken image, and never sends a request to a school's site while Paolo is reading. The
// URLs come from `state/waterpolo-logos.json`, which `build-waterpolo.mjs` collects as it parses.
//
// Logos are resized, never cropped, so proportions are kept. A team with no usable logo simply has
// no file and the app draws its initials instead.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const OUT_DIR = 'public/logos';
const SRC = 'state/waterpolo-logos.json';
const SIZE = 96; // rendered at 40 px, so this covers 2x screens
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const force = process.argv.includes('--force');

async function fetchBinary(url, attempt = 0) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 200) throw new Error('response too small to be an image');
    return buf;
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return fetchBinary(url, attempt + 1);
    }
    throw e;
  }
}

async function main() {
  const urls = JSON.parse(await readFile(SRC, 'utf8'));
  await mkdir(OUT_DIR, { recursive: true });
  const have = new Set((await readdir(OUT_DIR).catch(() => [])).map((f) => f.replace(/\.webp$/, '')));

  let written = 0;
  let skipped = 0;
  const failed = [];

  for (const [slug, url] of Object.entries(urls)) {
    if (!force && have.has(slug)) {
      skipped++;
      continue;
    }
    try {
      const buf = await fetchBinary(url);
      const out = await sharp(buf)
        .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 88 })
        .toBuffer();
      await writeFile(`${OUT_DIR}/${slug}.webp`, out);
      written++;
    } catch (e) {
      failed.push(`${slug}: ${(e && e.message) || e}`);
    }
    await new Promise((r) => setTimeout(r, 150)); // be a polite guest on school servers
  }

  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.webp'));
  let bytes = 0;
  for (const f of files) bytes += (await readFile(`${OUT_DIR}/${f}`)).byteLength;
  console.log(
    `logos: ${written} written, ${skipped} already present, ${failed.length} failed · ` +
      `${files.length} files, ${(bytes / 1024).toFixed(0)} KB total`,
  );
  for (const f of failed) console.log(`  FAILED ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
