/**
 * Fetch the member photos that are still remote URLs, convert them to PNG, and store
 * them locally:
 *   - named <学号>.png when a 学号 could be resolved from the workbook
 *   - otherwise named after the member's pinyin initials (王广辉 -> wgh.png)
 *
 * The members.json `photo` field is repointed at the new local file. The edit is a
 * literal one-line replacement, so the file's formatting is preserved, and every
 * replacement must match exactly once or nothing is written.
 *
 * Dependencies (installed with --no-save, not project deps):
 *   npm install --no-save --cache ./.npm-cache xlsx sharp pinyin-pro
 *
 * Usage: node scripts/fetch_remote_member_photos.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { pinyin } = require('pinyin-pro');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'public', 'data', 'members.json');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'excellent_member');
const PLACEHOLDER = 'default.png';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) jxufe-acm-vue-photo-fetch/1.0';

/** 学号 for members the workbook could resolve. Members absent from the workbook fall
 *  back to pinyin initials. 张锦宇 is deliberately NOT here: the only 张锦宇 in the
 *  export is a 2025级 软件工程 student from 湖南 (born 2007), a different person from
 *  the 21级 计算机科学与技术2班 member, so no 学号 can be attributed to him. */
const SNOS = {};

/** Initials from the Chinese name, e.g. 王广辉 -> wgh. */
function initials(name) {
  const chars = [...name].filter((c) => /[\u4e00-\u9fa5]/.test(c));
  return chars
    .map((c) => pinyin(c, { toneType: 'none', pattern: 'first', type: 'array' })[0])
    .join('')
    .toLowerCase();
}

const raw = fs.readFileSync(JSON_PATH, 'utf8');
const members = JSON.parse(raw);

const targets = members.filter((m) => {
  const p = String(m.photo || '');
  return p && !p.startsWith('/images/');
});

// Decide the destination filename for each, and refuse to invent one for non-Chinese names.
const plan = [];
for (const m of targets) {
  const sno = SNOS[m.name];
  const base = sno || initials(m.name);
  if (!base) {
    plan.push({ member: m, base: null, skip: '无法生成拼音缩写（非中文姓名）' });
    continue;
  }
  plan.push({ member: m, base, file: `${base}.png` });
}

// Collision check across the plan and against existing files.
const seen = new Map();
for (const p of plan) {
  if (!p.file) continue;
  if (seen.has(p.file)) throw new Error(`两个成员会得到同一个文件名 ${p.file}: ${seen.get(p.file)} / ${p.member.name}`);
  seen.set(p.file, p.member.name);
  const existing = path.join(IMG_DIR, p.file);
  if (fs.existsSync(existing)) {
    const isPlaceholder = fs.readFileSync(existing).equals(fs.readFileSync(path.join(IMG_DIR, PLACEHOLDER)));
    if (!isPlaceholder) throw new Error(`目标文件已存在且不是占位图，拒绝覆盖: ${p.file}`);
  }
}

console.log(`待处理 ${targets.length} 位成员的远程照片：`);
for (const p of plan) {
  console.log(`  ${p.member.name.padEnd(5, '\u3000')} ${String(p.member.photo).slice(0, 60)}  ->  ${p.file || '(跳过: ' + p.skip + ')'}`);
}

if (!APPLY) {
  console.log('\nDRY RUN. Re-run with --apply to download, convert and rewrite members.json.');
  process.exit(0);
}

// ---------------------------------------------------------------- download + convert
async function main() {
  const results = [];
  let newRaw = raw;
  for (const p of plan) {
    if (!p.file) { results.push({ name: p.member.name, ok: false, error: p.skip }); continue; }
    const dest = path.join(IMG_DIR, p.file);
    try {
      const res = await fetch(p.member.photo, { redirect: 'follow', headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const src = Buffer.from(await res.arrayBuffer());
      const srcMeta = await sharp(src).metadata();
      const png = await sharp(src).png({ compressionLevel: 9, effort: 10 }).toBuffer();
      const outMeta = await sharp(png).metadata();
      if (outMeta.format !== 'png') throw new Error(`converted to ${outMeta.format}`);
      if (outMeta.width !== srcMeta.width || outMeta.height !== srcMeta.height) throw new Error('dimensions changed');
      if (outMeta.width < 50 || outMeta.height < 50) throw new Error(`suspicious size ${outMeta.width}x${outMeta.height}`);

      fs.writeFileSync(dest, png);

      // Repoint members.json literally.
      const from = `"photo": ${JSON.stringify(p.member.photo)},`;
      const occurrences = newRaw.split(from).length - 1;
      if (occurrences !== 1) throw new Error(`members.json 中该 photo 行出现 ${occurrences} 次，未写入`);
      newRaw = newRaw.replace(from, `"photo": ${JSON.stringify(`/images/excellent_member/${p.file}`)},`);

      results.push({ name: p.member.name, file: p.file, ok: true, from: srcMeta.format, w: outMeta.width, h: outMeta.height, srcBytes: src.length, pngBytes: png.length });
      console.log(`saved ${p.file.padEnd(10)} ${p.member.name.padEnd(5, '\u3000')} ${srcMeta.format} -> png  ${outMeta.width}x${outMeta.height}  ${src.length}B -> ${png.length}B`);
    } catch (e) {
      results.push({ name: p.member.name, file: p.file, ok: false, error: e.message });
      console.log(`FAILED ${p.file} ${p.member.name}: ${e.message}`);
    }
  }

  // Verify the rewritten JSON parses and every patched photo is correct.
  const after = JSON.parse(newRaw);
  if (after.length !== members.length) throw new Error('member count changed');
  for (const r of results.filter((x) => x.ok)) {
    const m = after.find((x) => x.name === r.name);
    if (m.photo !== `/images/excellent_member/${r.file}`) throw new Error(`photo 校验失败: ${r.name}`);
  }

  if (!fs.existsSync(`${JSON_PATH}.bak`)) {
    fs.copyFileSync(JSON_PATH, `${JSON_PATH}.bak`);
    console.log('备份已写入 public/data/members.json.bak');
  }
  fs.writeFileSync(JSON_PATH, newRaw, 'utf8');

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} 成功; members.json 已更新`);
  for (const r of results.filter((x) => !x.ok)) console.log(`  未处理 ${r.name}: ${r.error}`);
  fs.writeFileSync(
    path.join(__dirname, 'remote_photo_fetch_result.json'),
    JSON.stringify({ appliedAt: new Date().toISOString(), results }, null, 2),
    'utf8'
  );
}

main().catch((e) => {
  console.error('ABORTED:', e.message);
  process.exit(1);
});
