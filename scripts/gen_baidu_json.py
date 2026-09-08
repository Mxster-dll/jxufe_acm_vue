# -*- coding: utf-8 -*-
"""
百度之星 → 官网名单数据生成器
从协会资料库的江西财经大学导出 CSV(获奖/晋级名单,每年初赛/决赛一份)生成
官网前端使用的 public/data/baidu.json。

口径(与 2026-09-08 导出确认一致):
- 仅收录获奖记录(环节=决赛获奖 / 省赛获奖 / 初赛获奖(金银铜));晋级400/决赛参赛确认等无奖记录不上官网。
- 按官方记录忠实分组:每年「决赛」「初赛」两个环节;初赛内按场次分组,同一人多场次获奖分别列出。
- 届次 = 年份 - 2004(2005 = 第1届)。
- rank = 公告内序号;date = 公告发布日期;src = 官方公告标题。

用法: python scripts/gen_baidu_json.py [导出CSV目录] [输出json路径]
缺省输入: ../../../01_竞赛赛季/百度之星/获奖名单数据/江西财经大学获奖名单导出
缺省输出: ../public/data/baidu.json
"""
import csv
import glob
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_IN = os.path.normpath(os.path.join(BASE, "../../..", "01_竞赛赛季", "百度之星", "获奖名单数据", "江西财经大学获奖名单导出"))
DEFAULT_OUT = os.path.normpath(os.path.join(BASE, "..", "public", "data", "baidu.json"))

# 年份 → 届次(中文数字,与 lanqiao.json 的 edition 字段风格一致)
CN = "零一二三四五六七八九"


def edition_cn(year):
    n = year - 2004  # 2005=第1届
    if n <= 0 or n > 99:
        raise ValueError(f"年份 {year} 超出届次映射范围")
    if n < 10:
        return CN[n]
    if n < 20:
        return "十" + (CN[n - 10] if n % 10 else "")
    tens, ones = divmod(n, 10)
    return CN[tens] + "十" + (CN[ones] if ones else "")


def read_rows(csv_path):
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rd = csv.reader(f)
        header = [h.strip() for h in next(rd)]
        idx = {name: header.index(name) for name in
               ("公告内序号", "姓名", "奖项", "环节", "场次", "组别/分区", "来源公告", "发布日期")}
        rows = []
        for line in rd:
            if not line or not line[0].strip():
                continue
            g = lambda k: line[idx[k]].strip()  # noqa: E731
            rows.append({
                "seq": int(re.sub(r"\D", "", g("公告内序号")) or 0),
                "name": g("姓名"),
                "award": g("奖项"),
                "round_kind": g("环节"),
                "round": g("场次"),
                "group": g("组别/分区"),
                "src": g("来源公告"),
                "date": g("发布日期"),
            })
    return rows


def main():
    in_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IN
    out_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    years = {}
    files = sorted(glob.glob(os.path.join(in_dir, "????初赛_江西财经大学.csv")) +
                   glob.glob(os.path.join(in_dir, "????决赛_江西财经大学.csv")))
    if not files:
        print(f"未在 {in_dir} 找到导出 CSV")
        sys.exit(1)
    for fp in files:
        year = int(os.path.basename(fp)[:4])
        for r in read_rows(fp):
            # 仅获奖记录;晋级/参赛确认(奖项为空)不上官网
            if not r["award"]:
                continue
            stage = "final" if r["round_kind"] == "决赛获奖" else "preliminary"
            # 决赛按组别/分区(如 大学组)分组;初赛按场次(第一场…)分组
            gkey = r["group"] if stage == "final" else (r["round"] or "初赛")
            years.setdefault(year, {})  # {"final": {gkey: {...}}, "preliminary": {...}}
            stages = years[year].setdefault("stages", {})
            stage_map = stages.setdefault(stage, {})
            grp = stage_map.setdefault(gkey, {"rows": [], "date": r["date"]})
            grp["rows"].append(r)
    out_years = []
    for year in sorted(years, reverse=True):
        st = years[year]["stages"]
        stage_list = []
        for stage, label in (("final", "决赛"), ("preliminary", "初赛")):
            stage_map = st.get(stage)
            if not stage_map:
                stage_list.append({"key": stage, "groups": []})
                continue
            groups = []
            for gkey in sorted(stage_map, key=lambda k: (stage_map[k]["date"], k)):
                grp = stage_map[gkey]
                rows = sorted(grp["rows"], key=lambda r: r["seq"])
                groups.append({
                    "label": gkey,
                    "date": grp["date"],
                    "rows": [{"name": r["name"], "award": r["award"],
                              "rank": r["seq"], "src": r["src"]} for r in rows],
                })
            stage_list.append({"key": stage, "groups": groups})
        out_years.append({
            "year": year,
            "edition": edition_cn(year),
            "stages": stage_list,
        })
    data = {
        "slug": "baidu",
        "name": "百度之星·程序设计大赛",
        "years": out_years,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    total = sum(len(g["rows"]) for y in out_years for s in y["stages"] for g in s["groups"])
    print(f"已写出 {out_path}")
    print(f"年份数 {len(out_years)} / 记录总人次 {total}")
    for y in out_years:
        print(f"  {y['year']} 第{y['edition']}届:", end=" ")
        for s in y["stages"]:
            n = sum(len(g["rows"]) for g in s["groups"])
            print(f"{s['key']}={n}", end="  ")
        print()


if __name__ == "__main__":
    main()
