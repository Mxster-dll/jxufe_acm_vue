import { ref, onMounted } from 'vue'

/**
 * 赛事举办时间：读取 /data/events/index.json 清单后，加载各赛事的时间文件，
 * 按年份倒序分组，供大事记时间轴以卡片形式展示比赛节点（与新闻同轴、按日期排序）。
 * 数据源与竞赛详情页参赛历史的“日期”列共用。
 */
export function useCompetitionEvents() {
  const eventsByYear = ref([]) // [{ year, items: [{ slug, name, title, summary, date, dateStr }] }]
  const loading = ref(true)

  onMounted(async () => {
    try {
      const res = await fetch('/data/events/index.json')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const index = await res.json()

      const files = await Promise.all(
        index.map(async (c) => {
          try {
            const r = await fetch(`/data/events/${c.slug}.json`)
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            const data = await r.json()
            return { ...c, events: data.events || [] }
          } catch (e) {
            console.error(`加载 /data/events/${c.slug}.json 失败:`, e)
            return { ...c, events: [] }
          }
        })
      )

      const groups = {}
      for (const comp of files) {
        for (const ev of comp.events) {
          const year = String(ev.year)
          let date = null
          let dateStr = `${year}年` // 无具体日期时回退显示年份
          if (ev.date) {
            date = new Date(ev.date)
            if (isNaN(date.getTime())) date = null
            else dateStr = date.toLocaleDateString('zh-CN')
          }
          ;(groups[year] ||= []).push({
            slug: comp.slug,
            year,
            name: comp.name,
            title: ev.title || comp.name,
            summary: ev.summary || '',
            date,
            dateStr
          })
        }
      }

      eventsByYear.value = Object.keys(groups)
        .sort((a, b) => b - a)
        .map((year) => ({
          year,
          items: groups[year].sort((a, b) => {
            // 有日期的按日期倒序，无日期的排在该年最后
            if (!a.date) return 1
            if (!b.date) return -1
            return b.date - a.date
          })
        }))
    } catch (e) {
      console.error('加载赛事举办时间失败:', e)
    } finally {
      loading.value = false
    }
  })

  return { eventsByYear, loading }
}
