import { onMounted, ref } from 'vue'
import { useJson } from './useJson'
import { loadHonorRecords } from '../utils/honorPills'
import { normalizeHonors } from '../utils/honorType'
import { stripCoveredHonors } from '../utils/honorCoverage'

/**
 * 荣誉显示的三份公共数据与两个纯函数（优秀成员页 / 协会负责人页共用）。
 *
 * 抽出来的原因（会长 2026-09-23 审查）：两页原先各自维护同一套取数，
 * 于是每个「荣誉怎么显示」的需求都得改两遍 —— 六个提交必须同时改两页，
 * 两页的 @keyframes ring-spin 还因此漂成了 5s / 4s。
 *
 * 这里只管**取数与归一化**，渲染在 <HonorTags>，卡片容器与排布仍各页自管。
 *
 * @returns {{
 *   duties: import('vue').Ref<Object>,   // /data/duties.json 的 people 表
 *   records: import('vue').Ref<Map<string, Array>>, // 自动汇总的比赛记录（Map<真名, 记录[]>）
 *   dutyOf: (x: Object) => Array,        // 某人的职务胶囊
 *   shownName: (x: Object) => string,    // 对外显示名（匿名机制：displayName → name）
 *   cleanHonors: (list: Array, name?: string) => Array, // 手写荣誉 + 奖学金：先去覆盖、再归一化出类型
 * }}
 */
export function useHonorDisplay() {
  /** 协会职务胶囊：两份会长维护的干事名单 → 07_技术项目/qq-group-avatars/build_duties.py
      → public/data/duties.json。文字口径「<年份>学年<职务>」，部门负责人带「协会」前缀。
      **只用于显示、不进排名分值**（手写职务会被按「学生职务」计 1.5 分，所以名单里的人
      不要再在 honors 里手写职务 —— 口径见 AGENTS.md）。 */
  const { data: duties } = useJson('/data/duties.json', { initial: {} })

  /** 国家奖学金 / 国家励志奖学金 ——**生成物**，请勿手改：由工作区的
      07_技术项目/奖学金数据/build_scholarships.py 从信息库那份**全校**名单
      （jxufe_scholarships.json，4379 条 / 2016-2017 ~ 2024-2025 九个学年）匹配到协会成员后
      产出。每条都带 identity 判据（matchBasis）与原始公示 URL（sourceUrl），可逐条回溯。
      条目自带 `type: 'honor'` —— 显式走绿色（个人荣誉），不依赖 honorType.js 的关键词兜底，
      将来兜底规则重排也不会改色。 */
  const { data: scholarships } = useJson('/data/scholarships.json', { initial: {} })

  /** 比赛战绩：从站点竞赛数据自动汇总（ICPC/CCPC/天梯赛/百度之星/蓝桥杯）。
      数据异步加载、失败不影响其它内容；两页与显示排名共用同一份缓存（utils/honorPills.js）。 */
  const records = ref(new Map())
  onMounted(async () => {
    records.value = await loadHonorRecords()
  })

  /** 职务胶囊：按**真名**查（duties.json 的键是真名） */
  const dutyOf = (x) => (x?.name && duties.value?.people?.[x.name]) || []

  /** 卡片上显示的名字。真名仍写在 name 里：自动奖牌汇总与显示排名都按真名匹配，
      只是不显示出来；没有 displayName 的人两者相同，行为不变。 */
  const shownName = (x) => x?.displayName || x?.name || ''

  /** 某个人的奖学金荣誉。按**真名**查 —— 与自动战绩汇总、显示排名同一套键
      （匿名机制只换显示名，真名仍是 name / realName）。 */
  const scholarshipOf = (name) => (name && scholarships.value?.people?.[name]) || []

  /** 手写荣誉 + 奖学金：先过掉已被自动汇总覆盖的（口径见 utils/honorCoverage.js），
      再归一化成 { text, type }。**显示与排名必须用同一份** —— 否则同一块奖牌
      会在卡片上显示两遍、在分值里也算两遍。
      奖学金按 text 与手写条目去重：手写过「2024-2025学年国家奖学金」的人不会显示两遍。 */
  const cleanHonors = (list, name) => {
    const base = normalizeHonors(stripCoveredHonors(Array.isArray(list) ? list : []))
    const have = new Set(base.map((h) => h.text))
    return [...base, ...normalizeHonors(scholarshipOf(name).filter((s) => !have.has(String(s?.text || ''))))]
  }

  return { duties, records, dutyOf, shownName, scholarshipOf, cleanHonors }
}
