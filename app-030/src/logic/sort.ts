/**
 * 共享排序比较器：项目台账、规则版本列表、归并汇总（号型行 / 班级车间 / 批次 / 备货分布）共用。
 * 纯逻辑层：不依赖 Vue / DOM，命令行与测试可直接调用。
 *
 * 稳定性：ES2020 规范要求 Array.prototype.sort 稳定，stableSorted 依赖该保证；
 *       Map 首次出现次序即并列时的隐式次序（汇总入桶顺序）。
 *
 * 旧存档兼容（IndexedDB 不存任何排序结果，顺序全部现算）：本文件比较器逐行搬自
 * store.ts / merge.ts 的旧内联实现——同 locale、同兜底、同并列裁决，比较符号不变，
 * 旧项目读回的顺序即与改造前逐位一致，故无需数据迁移。
 */
import type { Gender, Project, SizeRule, SummaryRow } from './types'

/**
 * 号型汇总行排序：常规档在前、特殊档垫底；男装在前；
 * 再按 号(身高) / 型(胸围) / 型别(YABC) 数值升序。
 * 号型代码解析失败时（特殊档标记码 PLUS/CUSTOM/TALL）退回裸 localeCompare（ASCII，结果与旧实现一致）。
 */
export function compareSummaryRows(a: SummaryRow, b: SummaryRow): number {
  if (a.isSpecial !== b.isSpecial) return a.isSpecial ? 1 : -1
  if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1
  const pa = parseSizeCode(a.sizeCode)
  const pb = parseSizeCode(b.sizeCode)
  if (!pa || !pb) return a.sizeCode.localeCompare(b.sizeCode)
  if (pa.height !== pb.height) return pa.height - pb.height
  if (pa.chest !== pb.chest) return pa.chest - pb.chest
  return pa.fit - pb.fit
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

/** 备货分布排序：数量降序，数量相同按号型行次序裁决（保证并列确定性）。 */
export function compareDistribution(a: SummaryRow, b: SummaryRow): number {
  return b.qty - a.qty || compareSummaryRows(a, b)
}

/**
 * 班级 / 车间、批次等中文名称排序：固定 zh-Hans-CN，页面、导出、打印三处一致。
 * 空值兜底（未填班级/车间 / 未分批）由调用方在入桶前替换，比较器只处理非空串。
 */
export function compareChineseName(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN')
}

/**
 * 规则版本列表排序：生效日期升序，同日再按版本号升序。
 * 沿用旧实现的裸 localeCompare（不带 locale）：版本号与日期均为 ASCII，结果与旧存档列表一致；
 * 生效日期为空串时按现状排在最前。
 */
export function compareRules(a: SizeRule, b: SizeRule): number {
  return a.effectiveFrom === b.effectiveFrom
    ? a.version.localeCompare(b.version)
    : a.effectiveFrom.localeCompare(b.effectiveFrom)
}

/** 项目台账排序：更新时间倒序（最近更新在前）；并列保持入列次序（稳定排序）。 */
export function compareProjectsByUpdated(a: Project, b: Project): number {
  return b.updatedAt - a.updatedAt
}

/** 性别次序：男装在前、女装在后（号型行比较的子规则，供需要处复用）。 */
export function compareGender(a: Gender, b: Gender): number {
  if (a === b) return 0
  return a === 'male' ? -1 : 1
}

/** 稳定排序：返回新数组，不改原数组。 */
export function stableSorted<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return [...items].sort(compare)
}
