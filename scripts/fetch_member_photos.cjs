/**
 * Download the remote (imgdb.cn image-host) member photos and store them locally as
 * PNG, named after each member's 学号.
 *
 * Context: 11 members kept their photos on https://pic1.imgdb.cn, so
 * excellent_member/ only had a default.png placeholder for them. This script fetches
 * the real photo, converts it to PNG and writes <学号>.png, replacing the placeholder.
 *
 * Dependencies (not project deps; installed with --no-save for this one-off job):
 *   npm install --no-save --cache ./.npm-cache xlsx sharp
 *
 * Usage: node scripts/fetch_member_photos.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'excellent_member');

/** 学号 -> imgdb.cn URL, taken verbatim from members.json. */
const SOURCES = [
  { sno: '0233614', name: '罗潇彬', url: 'https://pic1.imgdb.cn/item/68d37164c5157e1a882c81ec.jpg' },
  { sno: '0233750', name: '杨源鑫', url: 'https://pic1.imgdb.cn/item/68d37164c5157e1a882c81eb.jpg' },
  { sno: '0243936', name: '钟俊',   url: 'https://pic1.imgdb.cn/item/68d37166c5157e1a882c81f0.jpg' },
  { sno: '0224568', name: '徐昊天', url: 'https://pic1.imgdb.cn/item/68d37168c5157e1a882c81f2.jpg' },
  { sno: '0224571', name: '牛志义', url: 'https://pic1.imgdb.cn/item/68d37168c5157e1a882c81f3.jpg' },
  { sno: '0240890', name: '王柯迪', url: 'https://pic1.imgdb.cn/item/68d3716dc5157e1a882c81f5.jpg' },
  { sno: '0224585', name: '娄子豪', url: 'https://pic1.imgdb.cn/item/68d39a07c5157e1a882c97a7.jpg' },
  { sno: '0233430', name: '张瑞杰', url: 'https://pic1.imgdb.cn/item/68d3c017c5157e1a882cca2a.jpg' },
  { sno: '0235011', name: '张云菲', url: 'https://pic1.imgdb.cn/item/68d3cc7ec5157e1a882cd25a.jpg' },
  { sno: '0235108', name: '万俊哲', url: 'https://pic1.imgdb.cn/item/68d3cf53c5157e1a882cd399.jpg' },
  { sno: '0240751', name: '杨镇宁', url: 'https://pic1.imgdb.cn/item/68d3c14ec5157e1a882ccb51.jpg' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) jxufe-acm-vue-photo-fetch/1.0';

(async () => {
  const results = [];
  for (const item of SOURCES) {
    const target = path.join(IMG_DIR, `${item.sno}.png`);
    try {
      const res = await fetch(item.url, { redirect: 'follow', headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const src = Buffer.from(await res.arrayBuffer());

      // Convert to PNG, keeping the original resolution (the sources are square).
      const png = await sharp(src).png({ compressionLevel: 9, effort: 10 }).toBuffer();
      const meta = await sharp(png).metadata();
      if (meta.format !== 'png') throw new Error(`conversion produced ${meta.format}`);
      if (meta.width < 50 || meta.height < 50) throw new Error(`suspicious size ${meta.width}x${meta.height}`);

      // Guard: never overwrite a file that is NOT the default placeholder.
      if (fs.existsSync(target)) {
        const same = fs.readFileSync(target).equals(fs.readFileSync(path.join(IMG_DIR, 'default.png')));
        if (!same) throw new Error(`refuse to overwrite non-placeholder ${item.sno}.png`);
      }

      if (APPLY) fs.writeFileSync(target, png);
      results.push({ ...item, ok: true, bytes: png.length, w: meta.width, h: meta.height, srcBytes: src.length });
      console.log(`${APPLY ? 'saved' : 'would save'} ${item.sno}.png  ${item.name.padEnd(4, '\u3000')} ${meta.width}x${meta.height}  ${src.length}B jpeg -> ${png.length}B png`);
    } catch (e) {
      results.push({ ...item, ok: false, error: e.message });
      console.log(`FAILED ${item.sno}.png ${item.name} ${e.message}`);
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${ok}/${results.length} succeeded`);
  if (failed.length) {
    console.log('failed:');
    for (const f of failed) console.log(`  ${f.name} ${f.sno} ${f.error}`);
  }
  fs.writeFileSync(
    path.join(__dirname, 'member_photo_fetch_result.json'),
    JSON.stringify({ appliedAt: new Date().toISOString(), apply: APPLY, results }, null, 2),
    'utf8'
  );
  if (!APPLY) console.log('\nDRY RUN. Re-run with --apply to write files.');
})();
