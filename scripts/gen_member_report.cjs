/**
 * Regenerate scripts/excellent_member_rename_report.csv from the current state.
 *
 * Ground truth for "what happened to each member's image":
 *   - 学号 resolved from 全校学生信息导出.xls via 姓名 (see rename_excellent_member.cjs)
 *   - file status read live from public/images/excellent_member/
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'excellent_member');

/** name, class, 学号, 图片文件名, how the image got its name, why that name is right. */
const ROWS = [
  ['王海峰', '21计算机科学与技术1班', '', 'whf.png', 'skip', '表中无此姓名（21 级本科生未导出）-> 保留原文件名'],
  ['王俊杰', '22计算机科学与技术1班', '0224588', '0224588.png', 'rename', '同名 2 人，按班级/年级消歧（22计算机（1）班）'],
  ['韩家欢', '22信息与计算科学1班', '0224847', '0224847.png', 'rename', '全表唯一同名'],
  ['vesper', '---', '', 'hyb.png', 'skip', '网名，表中无此姓名 -> 保留原文件名'],
  ['陈世坤', '21计算机科学与技术1班', '', 'csk.png', 'skip', '表中无此姓名（21 级本科生未导出）-> 保留原文件名'],
  ['一位不愿透露姓名的学长', '----', '', 'shl.png', 'skip', '匿名，表中无此姓名 -> 保留原文件名'],
  ['邓一帆', '22软件工程9班', '0223591', '0223591.png', 'rename', '全表唯一同名'],
  ['李鑫', '计算机231', '0234934', '0234934.png', 'rename', '"计算机231" 解析为 23 级计算机 1 班，命中 23计算机（1）班（另 6 个同名均非同届同专业）'],
  ['张瑞杰', '软件231', '0233430', '0233430.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['林俊坤', '21计算机科学与技术1班', '', 'ljk.png', 'skip', '表中无此姓名（21 级本科生未导出）-> 保留原文件名'],
  ['彭俊杰', '21量化 & 25数学', '825200248', '825200248.png', 'rename', '"25数学" 对应 2025 级数学类（表内唯一同名，学院为信息管理与数学学院）'],
  ['肖俊杰', '22计算机科学与技术2班', '0224613', '0224613.png', 'rename', '同名 3 人，按班级/年级消歧（22计算机（2）班）'],
  ['万俊哲', '23数据科学与大数据技术1班', '0235108', '0235108.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['张云菲', '23计算机科学与技术2班', '0235011', '0235011.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['杨源鑫', '23软件工程3班', '0233750', '0233750.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['罗潇彬', '23软件工程12班', '0233614', '0233614.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['钟俊', '24计算机科学与技术2班', '0243936', '0243936.png', 'download', '"24计算机(2)班" 唯一匹配（另两个同名者分别在 24经济 / 22软件）'],
  ['陈帆', '23网络空间安全1班', '0235207', '0235207.png', 'rename', '全表唯一同名'],
  ['杨镇宁', '24数据科学与大数据技术1班', '0240751', '0240751.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['娄子豪', '22计算机科学与技术1班', '0224585', '0224585.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['牛志义', '22计算机科学与技术1班', '0224571', '0224571.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['徐昊天', '22计算机科学与技术1班', '0224568', '0224568.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['谢智屹', '23网络空间安全1班', '0235234', '0235234.png', 'rename', '全表唯一同名'],
  ['王柯迪', '24信息管理与信息系统1班', '0240890', '0240890.png', 'download', '全表唯一同名（照片下载自 imgdb.cn 图床）'],
  ['吴松烨', '22信息管理与信息系统1班', '0224766', '0224766.png', 'download', '全表唯一同名（原 bing 图床链接已 404，目录中已有可用的本人照片）'],
  ['王广辉', '21计算机科学与技术3班', 'wgh', 'wgh.png', 'download', '表中无此姓名（21 级本科生未导出）-> 按姓名拼音缩写 wgh 命名（照片下载自 bing 图床）'],
  ['张锦宇', '21计算机科学与技术2班', 'zjy', 'zjy.png', 'download', '表中唯一同名者为 2025 级软件工程学生（湖南，2007 年生），非本人 -> 按拼音缩写 zjy 命名'],
  ['吴清辉', '21计算机科学与技术2班', 'wqh', 'wqh.png', 'download', '表中无此姓名（21 级本科生未导出）-> 按姓名拼音缩写 wqh 命名（照片下载自 bing 图床）'],
  ['赵锐奇', '21计算机科学与技术3班', 'zrq', 'zrq.png', 'download', '表中无此姓名（21 级本科生未导出）-> 按姓名拼音缩写 zrq 命名（照片下载自 bing 图床）'],
  ['张艺环', '21计算机科学与技术1班', 'zyh', 'zyh.png', 'download', '表中无此姓名（21 级本科生未导出）-> 按姓名拼音缩写 zyh 命名（照片下载自 bing 图床）'],
  ['张昊林', '21计算机科学与技术3班', 'zhl', 'zhl.png', 'download', '表中无此姓名（21 级本科生未导出）-> 按姓名拼音缩写 zhl 命名（照片下载自 bing 图床）'],
  ['李梦豪', '23届大数据', 'lmh', 'lmh.png', 'download', '表中无此姓名（已毕业届别未导出）-> 按姓名拼音缩写 lmh 命名（照片下载自 bing 图床）'],
  ['罗文浩', '22届大数据', 'lwh', 'lwh.png', 'download', '表中无此姓名（已毕业届别未导出）-> 按姓名拼音缩写 lwh 命名（照片下载自知乎图床）'],
];

const STATUS_LABEL = {
  rename: '本地原图重命名为学号',
  download: '下载图床图片并转为 PNG',
  'copy-default': '复制 default.png',
  skip: '未处理',
};

const csvRows = [['姓名', '班级(members.json)', '学号/缩写', '文件', '处理方式', 'photo 字段', '判定依据']];
const members = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'members.json'), 'utf8'));
let missing = [];
for (const [name, cls, key, file, action, reason] of ROWS) {
  let label = STATUS_LABEL[action];
  const p = path.join(IMG_DIR, file);
  if (fs.existsSync(p)) {
    label += `（${fs.statSync(p).size} 字节）`;
  } else {
    missing.push(file);
    label += '（文件缺失！）';
  }
  const member = members.find((x) => x.name === name);
  const photo = member ? String(member.photo) : '(不在 members.json)';
  const photoKind = photo === `/images/excellent_member/${file}` ? '已指向本地' : `远程/不一致: ${photo.slice(0, 48)}`;
  csvRows.push([name, cls, key, file, label, photoKind, reason]);
}

const csv = csvRows
  .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
  .join('\n');
fs.writeFileSync(path.join(__dirname, 'excellent_member_rename_report.csv'), '\uFEFF' + csv, 'utf8');
console.log(`report regenerated: ${csvRows.length - 1} members | missing files: ${missing.length ? missing.join(', ') : 'none'}`);
