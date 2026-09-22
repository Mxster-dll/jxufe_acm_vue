/**
 * Ensure every <学号>.png in excellent_member/ is a REAL PNG.
 *
 * Some member photos (downloaded from the imgdb.cn image host, or copied in by hand)
 * were stored as JPEG bytes under a .png filename. Browsers do sniff the content and
 * still render them, but the file type is wrong, so this re-encodes them in place.
 *
 * The conversion is lossless in dimensions: only the container changes, pixels are
 * copied 1:1 at the original resolution.
 *
 * Usage: node scripts/normalize_member_images.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const APPLY = process.argv.includes('--apply');
const IMG_DIR = path.join(__dirname, '..', 'public', 'images', 'excellent_member');

(async () => {
  // Every member image except the placeholder itself (which is a real PNG already).
  const files = fs.readdirSync(IMG_DIR)
    .filter((f) => f.toLowerCase().endsWith('.png') && f !== 'default.png')
    .sort();
  const converted = [];
  const alreadyPng = [];

  for (const f of files) {
    const p = path.join(IMG_DIR, f);
    const buf = fs.readFileSync(p);
    const meta = await sharp(buf).metadata();
    if (meta.format === 'png') {
      alreadyPng.push(f);
      continue;
    }
    const png = await sharp(buf).png({ compressionLevel: 9, effort: 10 }).toBuffer();
    // sanity: same pixel dimensions, and the output really is a PNG
    const out = await sharp(png).metadata();
    if (out.format !== 'png' || out.width !== meta.width || out.height !== meta.height) {
      throw new Error(`${f}: conversion mismatch ${meta.format} ${meta.width}x${meta.height} -> ${out.format} ${out.width}x${out.height}`);
    }
    if (APPLY) fs.writeFileSync(p, png);
    converted.push({ f, from: meta.format, w: meta.width, h: meta.height, before: buf.length, after: png.length });
    console.log(`${APPLY ? 'converted' : 'would convert'} ${f}  ${meta.format} -> png  ${meta.width}x${meta.height}  ${buf.length}B -> ${png.length}B`);
  }

  console.log(`\ntotal ${files.length} files | ${converted.length} converted | ${alreadyPng.length} already real PNG`);
  if (alreadyPng.length) console.log('already PNG: ' + alreadyPng.join(' '));
  if (!APPLY) console.log('\nDRY RUN. Re-run with --apply to rewrite the files.');
})();
