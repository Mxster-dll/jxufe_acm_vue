/**
 * Rename excellent_member images to student IDs (学号).
 *
 * Source of truth:
 *   - public/data/members.json          -> member name + current photo path
 *   - 全校学生信息导出.xls (sheet 学籍信息导出) -> 姓名 (col D) / 学号 (col B)
 *
 * Rules:
 *   1. Member has a LOCAL image under excellent_member/ -> rename it to <学号>.<ext>
 *   2. Member's photo is a remote URL -> copy default.png to <学号>.png
 *   3. Member has no resolvable 学号 (21级 undergrads are absent from the export,
 *      plus non-real names) -> leave untouched
 *   4. default.png itself (the app's hardcoded error fallback) is never renamed
 *
 * This script was run once to perform the rename; it is kept as the record of how
 * each name was resolved. It needs the `xlsx` package, which is not a project
 * dependency (it was installed with --no-save and removed afterwards):
 *
 *   npm install --no-save --cache ./.npm-cache xlsx
 *   node scripts/rename_excellent_member.cjs            # dry run + report
 *   node scripts/rename_excellent_member.cjs --apply    # perform the operations
 *
 * A dry run is safe to repeat: members whose files were already renamed simply
 * show up as "no local file" and are not reported as changes.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const WORKBOOK = 'C:\\Users\\27349\\Desktop\\全校学生信息导出.xls';
const IMG_DIR = path.join(ROOT, 'public', 'images', 'excellent_member');
const JSON_PATH = path.join(ROOT, 'public', 'data', 'members.json');
const PLACEHOLDER = 'default.png';

const norm = (s) => String(s == null ? '' : s).replace(/[\s\u3000]/g, '').trim();

const TMP_DIR = path.join(__dirname, 'tmp');
/** Log of the file operations actually carried out, written by --apply. */
const APPLIED_LOG = path.join(TMP_DIR, 'applied_ops.json');

/** Chinese numeral used in 行政班级 ("2班") -> arabic, for grade/class disambiguation. */
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/**
 * Manual overrides for members whose name is duplicated in the school-wide table.
 * Each decision is justified by members.json's own `class` field.
 */
const OVERRIDES = {
  // members.json class "24计算机科学与技术2班" -> 行政班级 24计算机(2)班
  钟俊: { sno: '0243936', why: '"24计算机(2)班" 唯一匹配（另两个同名者分别在 24经济 / 22软件）' },
  // members.json class "计算机231" = 计算机 23级1班 -> 23计算机（1）班
  李鑫: { sno: '0234934', why: '"计算机231" 解析为 23 级计算机 1 班，命中 23计算机（1）班（另 6 个同名均非同届同专业）' },
  // members.json class "21量化 & 25数学"：表内唯一同名且为 25级 信息管理与数学学院
  彭俊杰: { sno: '825200248', why: '"25数学" 对应 2025 级数学类（表内唯一同名，学院为信息管理与数学学院）' },
};

/** Members whose 学号 cannot be derived; keep their files as-is. */
const EXPECTED_UNRESOLVED = [
  '王海峰', '陈世坤', '林俊坤', 'vesper', '一位不愿透露姓名的学长',
  '王广辉', '吴清辉', '赵锐奇', '张艺环', '张昊林', '张锦宇', '李梦豪', '罗文浩',
];

// ---------------------------------------------------------------- load workbook
const wb = XLSX.readFile(WORKBOOK, { raw: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
const H = rows[0];
const col = (n) => {
  const i = H.indexOf(n);
  if (i < 0) throw new Error(`column not found: ${n}`);
  return i;
};
const C = {
  sno: col('学号'), grade: col('年级'), name: col('姓名'), college: col('学院'),
  adm: col('录取专业名称'), cls: col('教学班级'), xz: col('行政班级'),
};

const students = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const name = norm(r[C.name]);
  if (!name) continue;
  students.push({
    row: i + 1, sno: norm(r[C.sno]), name, grade: norm(r[C.grade]),
    college: norm(r[C.college]), adm: norm(r[C.adm]),
    cls: norm(r[C.cls]), xz: norm(r[C.xz]),
  });
}

const byName = new Map();
for (const s of students) {
  if (!byName.has(s.name)) byName.set(s.name, []);
  byName.get(s.name).push(s);
}

// ------------------------------------------------------- parse class -> criteria
/**
 * Parse the members.json `class` field into matching criteria.
 *   "22计算机科学与技术1班" -> { year: 2022, major: "计算机科学与技术", num: 1 }
 *   "计算机231"             -> { year: 2023, major: "计算机",          num: 1 }
 *   "23届大数据" / "---"    -> null (no usable criteria)
 */
function parseClass(cls) {
  const s = norm(cls);
  let year = null;
  let major = null;
  let num = null;

  // Optional "NN" cohort prefix, e.g. "22计算机科学与技术1班" / "23届大数据"
  const ym = /^(\d{2})(?:届)?(.+)$/.exec(s);
  let rest = s;
  if (ym) {
    year = 2000 + Number(ym[1]);
    rest = ym[2];
  }

  // Trailing class number: "…1班" / "…231" (cohort+class) / "…23"
  const nm = /^([^\d（()）]*?)(\d+|[一二三四五六七八九十]+)(?:班)?$/.exec(rest);
  if (nm) {
    major = nm[1];
    let digits = nm[2];
    if (/^\d+$/.test(digits) && digits.length >= 3 && !year) {
      // "计算机231" style: NN = cohort, last digit = class number
      year = 2000 + Number(digits.slice(0, 2));
      digits = digits.slice(2);
    }
    num = CN_NUM[digits] !== undefined ? CN_NUM[digits] : Number(digits);
  } else {
    major = rest.replace(/班$/, '');
  }
  if (!major) major = null;
  return year === null && major === null ? null : { year, major, num };
}

/** Normalise an 行政班级 string into its class number, e.g. "22计算机（1）班" -> 1 */
function classNumberOf(rec) {
  const m = /[（(](\d+)[）)]\s*班?/.exec(rec.xz);
  if (m) return Number(m[1]);
  const t = /(\d+)\s*班\s*$/.exec(rec.xz);
  return t ? Number(t[1]) : null;
}

/**
 * Score a candidate record against members.json metadata.
 * Higher score = more likely the right person; null = incompatible.
 *
 * A year present in `class` is authoritative: a candidate from another cohort can
 * never be the same person, so it is rejected outright.
 */
function scoreCandidate(rec, member) {
  const parsed = parseClass(member.class);
  if (!parsed) return null; // no criteria -> caller must not guess

  if (parsed.year !== null && Number(rec.grade) !== parsed.year) return null;

  let score = 0;
  if (parsed.year !== null) score += 10;

  const hay = `${rec.adm}${rec.xz}${rec.cls}${rec.college}`;
  if (parsed.major) {
    // longest matching prefix of the major name wins ("计算机科学与技术" > "计算机")
    let best = 0;
    for (let len = Math.min(parsed.major.length, 10); len >= 2; len--) {
      if (hay.includes(parsed.major.slice(0, len))) { best = len; break; }
    }
    if (best === 0) return null; // major does not match at all
    score += best;
  }

  if (parsed.num !== null) {
    const n = classNumberOf(rec);
    if (n !== null && n === parsed.num) score += 10;
  }
  return score;
}

/**
 * Compatibility gate: is this candidate even plausible for the member?
 * Returns false only on a hard contradiction (cohort or major mismatch)
 * or when the member's own `class` gives us nothing to go on.
 */
function isCompatible(rec, member) {
  return scoreCandidate(rec, member) !== null;
}

// --------------------------------------------------------------- build the plan
const members = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const plan = [];
const usedTargets = new Map();

for (const m of members) {
  const photo = String(m.photo || '');
  const localMatch = /^\/images\/excellent_member\/(.+)$/.exec(photo);
  const srcFile = localMatch ? localMatch[1] : null;
  const isLocal = srcFile !== null && srcFile !== PLACEHOLDER && fs.existsSync(path.join(IMG_DIR, srcFile));

  const candidates = byName.get(norm(m.name)) || [];
  let chosen = null;
  let reason = '';

  if (OVERRIDES[m.name]) {
    chosen = candidates.find((c) => c.sno === OVERRIDES[m.name].sno) || null;
    reason = OVERRIDES[m.name].why;
    if (!chosen) throw new Error(`override target missing in workbook: ${m.name} ${OVERRIDES[m.name].sno}`);
  } else if (candidates.length === 0) {
    reason = '表中无此姓名 -> 跳过';
  } else if (candidates.length === 1) {
    if (isCompatible(candidates[0], m)) {
      chosen = candidates[0];
      reason = '全表唯一同名';
    } else {
      reason = `全表仅 1 个同名，但班级="${m.class}" 与该记录 (${candidates[0].grade}级 ${candidates[0].college}) 冲突 -> 跳过`;
    }
  } else {
    const scored = candidates
      .map((c) => ({ c, s: scoreCandidate(c, m) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s - a.s);
    if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) {
      chosen = scored[0].c;
      reason = `同名 ${candidates.length} 人，按班级/年级消歧 (score=${scored[0].s})`;
    } else {
      reason = `同名 ${candidates.length} 人，符合条件者 ${scored.length} 人，无法唯一确定 -> 跳过`;
    }
  }

  const sno = chosen ? chosen.sno : null;
  let action, target = null;
  if (!sno) {
    action = 'skip';
  } else if (isLocal) {
    const ext = path.extname(srcFile) || '.png';
    target = `${sno}${ext}`;
    action = 'rename';
  } else {
    target = `${sno}.png`;
    action = 'copy-default';
  }

  if (target) {
    if (usedTargets.has(target)) {
      throw new Error(`target collision: ${target} from ${m.name} and ${usedTargets.get(target)}`);
    }
    usedTargets.set(target, m.name);
  }

  plan.push({ member: m.name, cls: m.class, srcFile, isLocal, sno, action, target, reason, rec: chosen });
}

// -------------------------------------------------------------------- reporting
console.log(`member count: ${plan.length}`);
const groups = { rename: [], 'copy-default': [], skip: [] };
for (const p of plan) groups[p.action].push(p);

console.log('\n=== RENAME (local image -> 学号) ===');
for (const p of groups.rename) {
  console.log(`  ${p.member.padEnd(6, '\u3000')} ${p.srcFile.padEnd(12)} -> ${p.target.padEnd(12)} ${p.reason}`);
}
console.log('\n=== COPY default.png -> 学号 (remote-photo members) ===');
for (const p of groups['copy-default']) {
  console.log(`  ${p.member.padEnd(6, '\u3000')} ${p.target.padEnd(12)} ${p.reason}`);
}
console.log('\n=== SKIP (no 学号 found, left untouched) ===');
for (const p of groups.skip) {
  console.log(`  ${p.member.padEnd(6, '\u3000')} ${p.srcFile ? p.srcFile.padEnd(12) : '(remote)     '} ${p.reason}`);
}

const unresolvedNames = groups.skip.map((p) => p.member);
const unexpected = unresolvedNames.filter((n) => !EXPECTED_UNRESOLVED.includes(n));
const expectedButResolved = EXPECTED_UNRESOLVED.filter((n) => !unresolvedNames.includes(n));
console.log('\nunresolved:', unresolvedNames.length, '| unexpected:', JSON.stringify(unexpected), '| expected-but-resolved:', JSON.stringify(expectedButResolved));

// every real image file (other than the placeholder) must be accounted for
const onDisk = fs.readdirSync(IMG_DIR).filter((f) => f !== PLACEHOLDER);
const covered = new Set(plan.map((p) => p.srcFile).filter(Boolean));
const orphans = onDisk.filter((f) => !covered.has(f));
console.log('files on disk:', onDisk.length, '| orphans not referenced by members.json:', JSON.stringify(orphans));

fs.writeFileSync(path.join(__dirname, 'tmp', 'rename_plan.json'), JSON.stringify(plan, null, 2), 'utf8');
console.log('\nplan written to scripts/tmp/rename_plan.json');

// ------------------------------------------------------------- mapping report
/**
 * Report the operations actually performed. After a successful --apply the file
 * is written from APPLIED_LOG; on a dry run the current plan is described.
 */
function reportRowsFromApplied() {
  const log = JSON.parse(fs.readFileSync(APPLIED_LOG, 'utf8'));
  return log.ops.map((o) => [o.name, o.cls, o.sno || '', o.src || '(远程链接)',
    o.target || (o.src || '(远程链接)'), o.action, o.reason]);
}
function reportRowsFromPlan() {
  return plan.map((p) => [p.member, p.cls, p.sno || '', p.srcFile || '(远程链接)',
    p.action === 'rename' ? p.target : p.action === 'copy-default' ? p.target : (p.srcFile || '(远程链接)'),
    p.action === 'rename' ? 'rename' : p.action === 'copy-default' ? 'copy-default' : 'skip',
    p.reason]);
}
const opsExist = fs.existsSync(APPLIED_LOG);
console.log(opsExist
  ? '\nnote: files were already renamed by an earlier --apply; the report describes that run.'
  : '');
const reportPath = path.join(TMP_DIR, 'rename_report.csv');
const csvRows = [['姓名', '班级(members.json)', '学号', '原文件', '新文件', '操作', '判定依据']]
  .concat(opsExist ? reportRowsFromApplied() : reportRowsFromPlan());
const csv = csvRows
  .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
  .join('\n');
fs.writeFileSync(reportPath, '\uFEFF' + csv, 'utf8');
console.log(`report written: ${path.relative(ROOT, reportPath)}`);

// ------------------------------------------------------------------------ apply
if (!APPLY) {
  console.log('\nDRY RUN. Re-run with --apply to execute.');
  process.exit(0);
}

const ops = [];
for (const p of groups.rename) {
  const from = path.join(IMG_DIR, p.srcFile);
  const to = path.join(IMG_DIR, p.target);
  if (fs.existsSync(to)) throw new Error(`refuse to overwrite existing file: ${p.target}`);
  fs.renameSync(from, to);
  ops.push({ name: p.member, cls: p.cls, sno: p.sno, src: p.srcFile, target: p.target, action: 'rename', reason: p.reason });
  console.log(`renamed ${p.srcFile} -> ${p.target}`);
}
for (const p of groups['copy-default']) {
  const to = path.join(IMG_DIR, p.target);
  if (fs.existsSync(to)) throw new Error(`refuse to overwrite existing file: ${p.target}`);
  fs.copyFileSync(path.join(IMG_DIR, PLACEHOLDER), to);
  ops.push({ name: p.member, cls: p.cls, sno: p.sno, src: PLACEHOLDER, target: p.target, action: 'copy-default', reason: p.reason });
  console.log(`copied ${PLACEHOLDER} -> ${p.target}`);
}
fs.writeFileSync(APPLIED_LOG, JSON.stringify({ appliedAt: new Date().toISOString(), ops }, null, 2), 'utf8');
console.log('\nfile operations done. members.json was NOT modified: the members served by');
console.log('default.png copies still keep their remote (working) photo URLs, and skipped');
console.log('members keep their original filenames.');
