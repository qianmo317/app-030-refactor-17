/**
 * 一次性等价性对拍（不进构建产物、不进 src）：
 * 验证收成一处后的共享比较器 / 文案 / 时间戳，与改造前的内联实现输出逐位相同。
 * 运行：esbuild 打包后由 node 执行（见 scripts/run-consolidation-check.sh）。
 */
import { fileStamp, genderText, genderTextOrDash } from '../app-030/src/logic/display'
import {
  compareChineseName,
  compareDistribution,
  compareProjectsByUpdated,
  compareRules,
  compareSummaryRows,
  stableSorted
} from '../app-030/src/logic/sort'
import { buildSummary, runMerge } from '../app-030/src/logic/merge'
import { BUILTIN_RULES } from '../app-030/src/logic/sizeRules'
import type { Gender, Project, SizeRule, SummaryRow } from '../app-030/src/logic/types'

let failures = 0
function assert(cond: boolean, message: string): void {
  if (cond) return
  failures += 1
  console.error(`✗ ${message}`)
}
function shuffle<T>(input: T[], seed: number): T[] {
  const list = [...input]
  let s = seed
  for (let i = list.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/* ---------------- 旧实现（逐字复制自改造前的 merge.ts / store.ts / exporter.ts） ---------------- */

const fitOrderOld = ['Y', 'A', 'B', 'C']
function oldParseCode(code: string): { height: number; chest: number; fit: number } | null {
  const matched = /^(\d+(?:\.5)?)\/(\d+(?:\.5)?)([YABC])$/.exec(code)
  if (!matched) return null
  return { height: Number(matched[1]), chest: Number(matched[2]), fit: fitOrderOld.indexOf(matched[3]) }
}
function oldCompareRows(a: SummaryRow, b: SummaryRow): number {
  if (a.isSpecial !== b.isSpecial) return a.isSpecial ? 1 : -1
  if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1
  const pa = oldParseCode(a.sizeCode)
  const pb = oldParseCode(b.sizeCode)
  if (!pa || !pb) return a.sizeCode.localeCompare(b.sizeCode)
  if (pa.height !== pb.height) return pa.height - pb.height
  if (pa.chest !== pb.chest) return pa.chest - pb.chest
  return pa.fit - pb.fit
}
function oldCompareRules(a: SizeRule, b: SizeRule): number {
  return a.effectiveFrom === b.effectiveFrom
    ? a.version.localeCompare(b.version)
    : a.effectiveFrom.localeCompare(b.effectiveFrom)
}
function oldStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}`
}

/* ---------------- 1. 汇总行比较器（含特殊档码、男女、号/型/型别、不可解析码） ---------------- */

const rows: SummaryRow[] = []
const genders: Gender[] = ['male', 'female']
const fits = ['Y', 'A', 'B', 'C'] as const
let id = 0
for (const gender of genders) {
  for (let h = 155; h <= 185; h += 2.5) {
    for (let c = 80; c <= 104; c += 4) {
      for (const fit of fits) {
        rows.push({ sizeCode: `${h}/${c}${fit}`, gender, qty: (id % 7) + 1, isSpecial: false })
        id += 1
      }
    }
  }
  for (const code of ['PLUS', 'CUSTOM', 'TALL', '特体X', 'z-code', 'A-code']) {
    rows.push({ sizeCode: code, gender, qty: (id % 5) + 1, isSpecial: true })
    id += 1
  }
}

for (let seed = 1; seed <= 40; seed += 1) {
  const input = shuffle(rows, seed)
  const oldOrder = [...input].sort(oldCompareRows).map((r) => `${r.isSpecial}|${r.gender}|${r.sizeCode}`)
  const newOrder = stableSorted(input, compareSummaryRows).map((r) => `${r.isSpecial}|${r.gender}|${r.sizeCode}`)
  assert(JSON.stringify(oldOrder) === JSON.stringify(newOrder), `汇总行排序 seed=${seed} 与旧实现不一致`)
}

/* ---------------- 2. 备货分布：qty 降序 + 行序裁决 ---------------- */

for (let seed = 1; seed <= 20; seed += 1) {
  const input = shuffle(rows, seed + 100)
  const oldOrder = [...input].sort((a, b) => b.qty - a.qty || oldCompareRows(a, b)).map((r) => `${r.sizeCode}|${r.gender}`)
  const newOrder = stableSorted(input, compareDistribution).map((r) => `${r.sizeCode}|${r.gender}`)
  assert(JSON.stringify(oldOrder) === JSON.stringify(newOrder), `分布排序 seed=${seed} 与旧实现不一致`)
}

/* ---------------- 3. 中文名称（班级/批次）：zh-Hans-CN，含空值兜底串 ---------------- */

const names = ['高一(3)班', '高一1班', '高二(1)班', '初一甲班', '车间一', '车间三', '车间二', '未填班级/车间', '未分批', '春装', '秋装', '行政科', '班组A']
for (let seed = 1; seed <= 30; seed += 1) {
  const input = shuffle(names, seed + 200)
  const oldOrder = [...input].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  const newOrder = stableSorted(input, compareChineseName)
  assert(JSON.stringify(oldOrder) === JSON.stringify(newOrder), `中文名排序 seed=${seed} 与旧实现不一致`)
}

/* ---------------- 4. 规则版本：ASCII 日期/版本，含空日期 ---------------- */

const ruleLike = ['2023-01-01', '2024-03-01', '', '2024-01-15', '2026-12-31'].map((effectiveFrom, i) => ({
  effectiveFrom,
  version: `v${1 + (i % 3)}.${i}.0`
})) as SizeRule[]
for (let seed = 1; seed <= 20; seed += 1) {
  const input = shuffle(ruleLike, seed + 300)
  const oldOrder = [...input].sort(oldCompareRules).map((r) => `${r.effectiveFrom}|${r.version}`)
  const newOrder = stableSorted(input, compareRules).map((r) => `${r.effectiveFrom}|${r.version}`)
  assert(JSON.stringify(oldOrder) === JSON.stringify(newOrder), `规则排序 seed=${seed} 与旧实现不一致`)
}

/* ---------------- 5. 项目台账：updatedAt 倒序 + 并列稳定 ---------------- */

const projects = Array.from({ length: 25 }, (_, i) => ({ updatedAt: [10, 20, 20, 20, 30, 5][i % 6], marker: i })) as Array<
  Project & { marker: number }
>
for (let seed = 1; seed <= 20; seed += 1) {
  const input = shuffle(projects, seed + 400)
  const oldOrder = [...input].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => p.marker)
  const newOrder = stableSorted(input, compareProjectsByUpdated).map((p) => p.marker)
  assert(JSON.stringify(oldOrder) === JSON.stringify(newOrder), `项目台账排序 seed=${seed} 与旧实现不一致`)
}
// 显式稳定性断言：updatedAt 全等时保持入列次序
const tied = [{ updatedAt: 7, marker: 1 }, { updatedAt: 7, marker: 2 }, { updatedAt: 7, marker: 3 }] as Array<
  Project & { marker: number }
>
assert(
  stableSorted(tied, compareProjectsByUpdated).map((p) => p.marker).join(',') === '1,2,3',
  '并列时间戳未保持稳定次序'
)

/* ---------------- 6. 文案与时间戳逐字 ---------------- */

assert(genderText('male') === '男' && genderText('female') === '女', 'genderText 男/女 不正确')
assert(genderText('unknown' as Gender) === '女', 'genderText 非男即女行为与旧实现不一致')
assert(
  genderTextOrDash('male') === '男' && genderTextOrDash('female') === '女',
  'genderTextOrDash 男/女 不正确'
)
assert(genderTextOrDash(null) === '—' && genderTextOrDash('') === '—', 'genderTextOrDash 空值不是「—」')
const stampDate = new Date(2026, 0, 5, 9, 7) // 2026-01-05 09:07 本地
assert(fileStamp(stampDate) === oldStamp(stampDate), 'fileStamp 与旧 stamp 不一致')
assert(fileStamp(stampDate) === '20260105-0907', `fileStamp 结果异常：${fileStamp(stampDate)}`)

/* ---------------- 7. 端到端：buildSummary 输出顺序快照 ---------------- */

function person(partial: Partial<Project['persons'][number]>): Project['persons'][number] {
  return {
    id: `p_${Math.random()}`,
    name: partial.name ?? '某人',
    gender: partial.gender ?? 'male',
    orgUnit: partial.orgUnit ?? '',
    batch: partial.batch ?? '',
    heightCm: partial.heightCm ?? 170,
    weightKg: partial.weightKg ?? null,
    chestCm: partial.chestCm ?? 88,
    waistCm: partial.waistCm ?? 74,
    specialFlag: partial.specialFlag ?? null,
    note: '',
    status: partial.status ?? 'active',
    statusReason: '',
    anomaly: [],
    needsConfirm: false,
    possibleDuplicateOf: null,
    sourceRow: null,
    source: 'manual',
    result: null,
    createdAt: 0
  }
}

const rule = BUILTIN_RULES[0]
const project: Project = {
  id: 'prj_test',
  name: '对拍项目',
  kind: 'school',
  ruleVersion: rule.version,
  batches: ['秋装', '春装'],
  // 故意打乱：性别、班级、特殊档、号型档位、批次
  persons: [
    person({ name: '女B', gender: 'female', orgUnit: '车间二', batch: '春装', heightCm: 160, chestCm: 84, waistCm: 68 }), // 160/84A
    person({ name: '男高', gender: 'male', orgUnit: '高一(3)班', batch: '秋装', heightCm: 180, chestCm: 96, waistCm: 84 }), // 180/96? diff 12 => A
    person({ name: '特体', gender: 'male', orgUnit: '车间一', batch: '春装', specialFlag: 'TALL' }),
    person({ name: '男A', gender: 'male', orgUnit: '高一(3)班', batch: '秋装', heightCm: 170, chestCm: 88, waistCm: 74 }), // 170/88A diff14
    person({ name: '加肥', gender: 'female', orgUnit: '车间二', batch: '秋装', specialFlag: 'PLUS' }),
    person({ name: '女Y', gender: 'female', orgUnit: '高一1班', batch: '春装', heightCm: 165, chestCm: 88, waistCm: 64 }), // diff 24 => Y → 165/88Y
    person({ name: '空班', gender: 'male', orgUnit: '', batch: '', heightCm: 175, chestCm: 92, waistCm: 81 }) // diff 11 => B
  ],
  imports: [],
  createdAt: 0,
  updatedAt: 0
}
runMerge(project, rule)
const summary = buildSummary(project, rule)

const allKeys = summary.allRows.map((r) => `${r.sizeCode}/${r.gender}${r.isSpecial ? '/S' : ''}`)
assert(
  JSON.stringify(allKeys) === JSON.stringify([
    '170/88A/male',
    '175/92B/male',
    '180/96A/male',
    '160/84A/female',
    '165/88Y/female',
    'TALL/male/S',
    'PLUS/female/S'
  ]),
  `buildSummary allRows 顺序快照不符：${JSON.stringify(allKeys)}`
)
// 中文排序的具体次序依赖运行时 ICU（浏览器与 node 自带 ICU 对 zh-Hans-CN 结果不同）；
// 生产只在浏览器运行，新老比较器同环境下的逐位一致性已由上方第 3 项随机对拍保证。
// 这里只断言分组集合与空值兜底不变，具体中文次序不在 node 内冻结。
const orgUnits = summary.byOrgUnit.map((g) => g.orgUnit)
assert(
  JSON.stringify([...orgUnits].sort()) === JSON.stringify(['高一1班', '高一(3)班', '未填班级/车间', '车间一', '车间二'].sort()),
  `班级分组集合不符：${JSON.stringify(orgUnits)}`
)
assert(orgUnits.includes('未填班级/车间'), '空 orgUnit 未按旧兜底替换为「未填班级/车间」')
const batches = summary.byBatch.map((g) => g.batch)
assert(JSON.stringify([...batches].sort()) === JSON.stringify(['未分批', '春装', '秋装'].sort()), `批次分组集合不符：${JSON.stringify(batches)}`)
assert(batches.includes('未分批'), '空 batch 未按旧兜底替换为「未分批」')
// 备货分布第一档：170/88A 等均为 1，并列时应按 compareSummaryRows，第一个是 170/88A/male
assert(
  summary.distribution[0].sizeCode === '170/88A' && summary.distribution[0].gender === 'male',
  `分布首位快照不符：${JSON.stringify(summary.distribution[0])}`
)
assert(summary.conserved === true, '守恒应通过')

if (failures > 0) {
  console.error(`\n${failures} 项对拍失败`)
  process.exitCode = 1
} else {
  console.log('✓ 全部对拍通过：比较器 / 文案 / 时间戳 / buildSummary 快照与旧实现逐位一致')
}
