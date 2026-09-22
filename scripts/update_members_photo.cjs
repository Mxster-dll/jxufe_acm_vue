/**
 * Point members.json `photo` at the local excellent_member/<学号>.png files.
 *
 * Rules:
 *   - remote URL + a local <学号>.png exists  -> replace the URL with the local path
 *   - already a local path that exists        -> leave as is
 *   - no 学号 resolvable (21级 undergrads etc.) -> leave the remote URL untouched
 *
 * The edit is a literal one-line substring replacement, so the file's formatting
 * (2-space indent, CRLF) is preserved exactly. Every replacement must match exactly
 * once, otherwise the script aborts without writing.
 *
 * Usage: node scripts/update_members_photo.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'public', 'data', 'members.json');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'excellent_member');
const URL_PREFIX = '/images/excellent_member/';

/** Members whose 学号 was resolved from the workbook and whose local photo exists. */
const SNOS = {
  王俊杰: '0224588', 韩家欢: '0224847', 邓一帆: '0223591', 李鑫: '0234934',
  彭俊杰: '825200248', 肖俊杰: '0224613', 陈帆: '0235207', 谢智屹: '0235234',
  张瑞杰: '0233430', 万俊哲: '0235108', 张云菲: '0235011', 杨源鑫: '0233750',
  罗潇彬: '0233614', 钟俊: '0243936', 杨镇宁: '0240751', 娄子豪: '0224585',
  牛志义: '0224571', 徐昊天: '0224568', 王柯迪: '0240890', 吴松烨: '0224766',
};

let raw = fs.readFileSync(JSON_PATH, 'utf8');
const members = JSON.parse(raw);

const changes = [];
const unchangedLocal = [];
const keepRemote = [];

for (const m of members) {
  const sno = SNOS[m.name];
  if (!sno) { keepRemote.push({ name: m.name, photo: m.photo }); continue; }
  const localPath = `${URL_PREFIX}${sno}.png`;
  if (!fs.existsSync(path.join(IMG_DIR, `${sno}.png`))) {
    throw new Error(`local photo missing on disk: ${sno}.png (member ${m.name})`);
  }
  if (m.photo === localPath) { unchangedLocal.push({ name: m.name, photo: m.photo }); continue; }
  changes.push({ name: m.name, from: m.photo, to: localPath, line: `"photo": ${JSON.stringify(m.photo)},` });
}

console.log(`将要修改 ${changes.length} 条：`);
for (const c of changes) console.log(`  ${c.name.padEnd(5, '\u3000')} ${c.from.slice(0, 58)}  ->  ${c.to}`);
console.log(`\n已经是本地正确路径，无需改动 ${unchangedLocal.length} 条：`);
for (const u of unchangedLocal) console.log(`  ${u.name.padEnd(5, '\u3000')} ${u.photo}`);
console.log(`\n查不到学号，保留远程链接 ${keepRemote.length} 条：`);
for (const k of keepRemote) console.log(`  ${k.name.padEnd(5, '\u3000')} ${String(k.photo).slice(0, 58)}`);

// Apply as literal, exactly-once replacements.
const before = raw;
for (const c of changes) {
  const occurrences = raw.split(c.line).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly 1 occurrence for ${c.name}, found ${occurrences}: ${c.line}`);
  }
  raw = raw.replace(c.line, `"photo": ${JSON.stringify(c.to)},`);
}

// The result must still be valid JSON with the same members and patched photos.
const after = JSON.parse(raw);
if (after.length !== members.length) throw new Error('member count changed');
for (const c of changes) {
  const m = after.find((x) => x.name === c.name);
  if (!m || m.photo !== c.to) throw new Error(`verification failed for ${c.name}`);
}
for (const m of after) {
  for (const key of Object.keys(m)) if (!(key in members.find((x) => x.name === m.name))) throw new Error('schema changed');
}

if (!APPLY) {
  console.log('\nDRY RUN. Re-run with --apply to write members.json.');
  process.exit(0);
}

if (!fs.existsSync(`${JSON_PATH}.bak`)) {
  fs.copyFileSync(JSON_PATH, `${JSON_PATH}.bak`);
  console.log(`\n备份已写入: public/data/members.json.bak`);
}
fs.writeFileSync(JSON_PATH, raw, 'utf8');
console.log(`members.json 已更新: ${before.length} -> ${raw.length} 字符, ${changes.length} 条 photo 改为本地路径`);
