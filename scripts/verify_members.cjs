// Final end-to-end verification of members.json + excellent_member/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'excellent_member');
const members = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'members.json'), 'utf8'));

(async () => {
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const defHash = sha(fs.readFileSync(path.join(IMG_DIR, 'default.png')));

  const problems = [];
  const referenced = new Set();
  console.log('=== members.json 的 33 条 photo ===');
  for (const m of members) {
    const p = String(m.photo || '');
    if (!p.startsWith('/images/excellent_member/')) {
      problems.push(`${m.name}: 不是本地引用 (${p.slice(0, 40)})`);
      console.log(`REMOTE ${m.name}`);
      continue;
    }
    const f = p.split('/').pop();
    referenced.add(f);
    const abs = path.join(IMG_DIR, f);
    if (!fs.existsSync(abs)) { problems.push(`${m.name}: 文件不存在 ${f}`); continue; }
    const buf = fs.readFileSync(abs);
    const meta = await sharp(buf).metadata();
    let note = '';
    if (meta.format !== 'png') { problems.push(`${m.name}: ${f} 真实格式为 ${meta.format}`); note = ` <-- ${meta.format}`; }
    if (sha(buf) === defHash) { problems.push(`${m.name}: ${f} 仍是占位图`); note += ' <-- 占位图'; }
    console.log(`${f.padEnd(16)} ${m.name.padEnd(6, '\u3000')} png ${meta.width}x${meta.height} ${buf.length}B${note}`);
  }

  // Files on disk that no member references.
  const onDisk = fs.readdirSync(IMG_DIR).filter((f) => f !== 'default.png');
  const orphans = onDisk.filter((f) => !referenced.has(f));
  // Duplicate content among member photos (same picture used twice).
  const byHash = new Map();
  for (const f of referenced) {
    const h = sha(fs.readFileSync(path.join(IMG_DIR, f)));
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }
  const dupes = [...byHash.values()].filter((v) => v.length > 1);

  console.log(`\n文件总数: ${fs.readdirSync(IMG_DIR).length} | 被引用: ${referenced.size} | 未被引用: ${orphans.length ? orphans.join(', ') : '无'}`);
  if (dupes.length) console.log('内容重复的成员照片:', dupes.map((v) => v.join('=')).join(' , '));
  console.log(problems.length ? `\n问题 ${problems.length} 个:\n  ` + problems.join('\n  ') : '\n全部通过：33 条 photo 均为可打开的真实 PNG 照片');
})();
