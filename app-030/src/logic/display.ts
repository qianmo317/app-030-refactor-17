/**
 * 共享展示文案：录入 / 规则 / 归并 / 汇总 / 导出 / 打印六条路径共用同一套中文。
 * 纯逻辑层：不依赖 Vue / DOM，命令行与测试可直接调用。
 *
 * 三条路径对空值的要求不同，由调用方自行适配：
 * - 页面展示：缺失一般显示「—」→ genderTextOrDash
 * - 写文件（CSV / XLSX）：缺失必须落空串，不能写出「—」→ 用 genderText 后由导出行组装处 ?? ''
 */
import type { Gender } from './types'

/** 性别短标签：男 / 女。持久化的 gender 只有 male/female（导入与录入已拦截其它值）。 */
export function genderText(gender: Gender | string): string {
  return gender === 'male' ? '男' : '女'
}

/** 三态性别文案：识别不出（null / 非法值）时显示「—」，用于导入预览等存在空草稿的页面。 */
export function genderTextOrDash(gender: Gender | string | null | undefined): string {
  if (gender === 'male') return '男'
  if (gender === 'female') return '女'
  return '—'
}

/** 导出文件名时间戳：YYYYMMDD-HHMM（本地时区，与页面 new Date() 同时区）。 */
export function fileStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}`
}
