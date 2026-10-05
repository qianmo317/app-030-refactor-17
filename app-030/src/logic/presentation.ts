/**
 * 展示与落盘共用的文案规则。
 * 只依赖领域类型，不依赖 Vue / DOM，因此页面、CSV/XLSX、打印与命令行脚本都可直接调用。
 */
import type { Gender } from './types'

/** 人员性别短标签：页面表格、导出表头与打印稿统一使用「男 / 女」 */
export function genderLabel(gender: Gender): string {
  return gender === 'male' ? '男' : '女'
}

/** 旧存档或未识别字段的兼容入口；fallback 为页面原来的空值写法 */
export function genderLabelOr(gender: Gender | string | null | undefined, fallback = '—'): string {
  return gender === 'male' || gender === 'female' ? genderLabel(gender) : fallback
}

/** 导出文件名时间戳：YYYYMMDD-HHMM，按浏览器/本机本地时间生成 */
export function localDateTimeStamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}`
}
