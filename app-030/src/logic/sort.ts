/**
 * 跨页面与导出共用的排序规则。
 * 均返回/操作新数组，不改变旧存档中的 persons、rules 原始顺序；读取时排序，落盘仍保存原始数据。
 */
import type { Project, SizeRule, SummaryRow } from './types'

/** 显式稳定排序：比较结果为 0 时保留输入顺序，不依赖运行环境 Array.sort 是否稳定 */
export function stableSort<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item)
}

/** 项目台账：更新时间新的在前；同一毫秒保持 IndexedDB/数组中的既有先后 */
export function compareProjectsByUpdatedAt(a: Project, b: Project): number {
  return b.updatedAt - a.updatedAt
}

/** 规则版本：先按生效日期升序，同日再按版本号；完全相同保持旧顺序 */
export function compareRulesByVersion(a: SizeRule, b: SizeRule): number {
  return a.effectiveFrom === b.effectiveFrom
    ? a.version.localeCompare(b.version)
    : a.effectiveFrom.localeCompare(b.effectiveFrom)
}

function parseSizeCode(code: string): { height: number; chest: number; fit: number } | null {
  const matched = /^(\d+(?:\.5)?)\/(\d+(?:\.5)?)([YABC])$/.exec(code)
  if (!matched) return null
  const fitOrder = ['Y', 'A', 'B', 'C']
  return {
    height: Number(matched[1]),
    chest: Number(matched[2]),
    fit: fitOrder.indexOf(matched[3])
  }
}

/** 同一号型的行序：常规在前、特殊在后；男装在女装前；再按号 / 型 / 型别升序 */
export function compareSummaryRows(a: SummaryRow, b: SummaryRow): number {
  if (a.isSpecial !== b.isSpecial) return a.isSpecial ? 1 : -1
  if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1
  const pa = parseSizeCode(a.sizeCode)
  const pb = parseSizeCode(b.sizeCode)
  // 保留旧实现：只要有一个特殊码不符合常规号型格式，就退回中文字符串比较
  if (!pa || !pb) return a.sizeCode.localeCompare(b.sizeCode)
  if (pa.height !== pb.height) return pa.height - pb.height
  if (pa.chest !== pb.chest) return pa.chest - pb.chest
  return pa.fit - pb.fit
}

/** 备货分布：数量多的在前，同量时严格沿用汇总表顺序 */
export function compareDistributionRows(a: SummaryRow, b: SummaryRow): number {
  return b.qty - a.qty || compareSummaryRows(a, b)
}

/** 中文分组名（班级/车间、批次）排序；调用方需先把缺失字段替换成原有的空值文案 */
export function compareChineseText(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN')
}
