# 收成一处：展示 / 排序 / 写文件共享逻辑改造设计

> 范围：`app-030`。验收口径：**行为不变**——页面中文、导出文件名格式、列表顺序、归并结果、导出表内容逐字相同；`npm run build` 照旧通过；旧本机存档（IndexedDB）读回的顺序与文字不走样。

## 1. 现状盘点（重复点与死工具，逐一带位置）

### 1.1 性别 `男/女` 判断：5 套 + 1 个三态变体

| # | 位置 | 写法 | 空值/非男即女 |
|---|------|------|----------------|
| 1 | `src/logic/exporter.ts:23` `genderLabel()` | `gender === 'male' ? '男' : '女'` | 任意非 male 值 → `女` |
| 2 | `src/views/MeasureView.vue:213` `genderText()` | 同上 | 同上 |
| 3 | `src/views/MergeView.vue:263` `genderText()` | 同上 | 同上 |
| 4 | `src/views/SummaryView.vue:29` `genderText()` | 同上 | 同上 |
| 5 | `src/views/ExportView.vue:120` `genderText()` | 同上 | 同上 |
| 6 | `src/views/ImportView.vue:396`（模板内联） | `=== 'male' ? '男' : === 'female' ? '女' : '—'` | **三态**：识别不出 → `—` |

另有 `src/views/RulesView.vue:33` 的 `{ male: '男装', female: '女装'`，语义是「男装/女装」不是「男/女」，**不属于同一判断，不动**。

注意：1～5 的实际行为是「非男即女」。但项目里所有持久化的 `Person.gender` 在落盘前都经 `analyzeDraft` 拦截（`analyze.ts:57` 性别无法识别即无效行），所以旧存档中 gender 只会是 `male/female`，共享函数即便保持「非男即女」也不会让旧数据走样。

### 1.2 导出文件名时间戳：两套相同算法

- `src/logic/exporter.ts:36` 私有 `stamp(date)`：`YYYYMMDD-HHMM`（入参为 `ExportContext.generatedAt`）。
- `src/logic/csv.ts:115` `todayStamp()`：算法逐字符相同，只是内部 `new Date()`，**全项目无人调用**（死代码 + 重复实现）。
- 第三处文件名在 `MeasureView.vue:203`：`...-量体明细-离线兜底.csv`，**刻意不带时间戳**，属另一种约定，不动。

### 1.3 排序：两套列表各排一遍，比较写法不一致

- **规则版本列表**：`store.ts:51`（`initStore`）与 `store.ts:169`（`saveRule`）各写一遍，比较器相同：
  `effectiveFrom` 相等 → `version.localeCompare(version)`（**不带 locale**），否则 `effectiveFrom.localeCompare(...)`（**不带 locale**）。
- **项目台账**：`store.ts:40` `sortProjects()`：`b.updatedAt - a.updatedAt`（数值倒序，无并列裁决）。
- **归并汇总**（`src/logic/merge.ts`）另有三组中文/结构化比较：
  - `compareRows`（`:134`）：特殊档垫底 → 男前女后 → 号型代码按 号/型/型别 数值排；代码解析失败兜底 `a.sizeCode.localeCompare(b.sizeCode)`（**不带 locale**）；
  - 班级/车间组：`a.orgUnit.localeCompare(b.orgUnit, 'zh-Hans-CN')`（`:246`，**带 locale**）；
  - 批次组：`a.batch.localeCompare(b.batch, 'zh-Hans-CN')`（`:260`，**带 locale**）；
  - 备货分布：`b.qty - a.qty || compareRows(a,b)`（`:263`）。

「两处的比较写法不完全一样」具体指：规则列表对日期/版本用**裸 `localeCompare`（运行时默认 locale）**，班级/批次用**显式 `'zh-Hans-CN'`**，号型代码用**数值解析 + 裸 localeCompare 兜底**；项目台账则是纯数值差。空值方面：项目时间戳是必填 number；规则日期来自 `<input type="date">`，可能为 `''`，裸 `localeCompare` 下空串排在最前。

### 1.4 已经导出但无人调用的工具：实际有 8 个

用户描述「三四个」，按全量静态扫描（声明之外零引用）实际是 8 个；按文件分组正好 4 组：

| 组 | 符号 | 位置 | 处置 |
|----|------|------|------|
| sizeRules 展示辅助 | `fitRangeText` | `sizeRules.ts:115` | **接线** → RulesView 型别文案 |
| sizeRules 展示辅助 | `describeAlign` | `sizeRules.ts:120` | **接线** → RulesView 对齐示例 |
| sizeRules 展示辅助 | `stepCandidates` | `sizeRules.ts:126` | **删除**（当前 UI 无档位候选列；接线要新增界面，违反行为不变） |
| store | `ruleVersions` | `store.ts:35` | **删除**（只取 version 字符串的 computed，无人用；页面都用 `store.rules`） |
| store | `isRuleInUse` | `store.ts:86` | **接线** → RulesView 引用数徽标（现在内联 `projectsUsingRule(...).length`） |
| idb | `idbGet` | `idb.ts:60` | **删除**（无单键读取场景） |
| idb | `idbPutMany` | `idb.ts:68` | **接线** → `initStore` 补齐内置版本时合并成一次事务（纯写入合并，逐键数据不变） |
| csv | `todayStamp` | `csv.ts:115` | **删除**（与 1.2 重复的死实现，由共享时间戳取代） |

## 2. 核心矛盾与两套方案（先写清取舍）

共享的那一处要同时服务三条路径，它们的要求确实不一致：

| 要求 | 页面展示 | 导出文件（CSV/XLSX） | 打印稿 |
|------|----------|----------------------|--------|
| 文字长短 | 单元格可用长标签/徽标，空值显示 `—` | 单元格要短标签，空值写**空串 `''`**（Excel 里不能出现 `—`） | 用导出同款短标签，空值不显示 |
| 排序是否稳定 | 顺序影响阅读与定位 | 顺序即行号（序号列），必须确定性 | 同导出 |
| 中文比较 | 按中文拼音/笔画直觉 | 必须与页面、打印逐行一致 | 同导出 |

### 方案 A：收成纯逻辑层 + 各路径薄适配（**推荐，采纳**）

在 `src/logic/` 新增两个无 DOM 依赖模块：

- `display.ts`：`genderText(gender)`（`男/女`）、`genderTextOrDash(gender|null)`（三态）、`fileStamp(date)`（`YYYYMMDD-HHMM`）。
- `sort.ts`：`compareSummaryRows`、`compareRules`、`compareProjectsByUpdated`、`compareChineseName`（固定 `'zh-Hans-CN'`）、`stableSorted(list, cmp)`。

三条路径只做**薄适配**：导出路径在组装行时把 `null/undefined` 映射为 `''`；页面路径把缺失映射为 `—`；排序一律调用同一比较器，打印稿直接复用 `buildOrderSheet()` 的结果（现状本就如此）。

- **放弃什么**：放弃「各页面可以各写各的空值/文案」的自由；每个调用点多一次显式适配（选 `''` 还是 `—`）。
- **代价多大**：小。新增 2 个小文件、约 10 个调用点改为 import；适配函数只是 `?? ''` / `|| '—'` 一层。换来：可被命令行/测试直接 `import`（无 vue、无 document 依赖），导出与打印天然与页面同源。
- **风险**：低。比较器逐个「搬」而不是「重写」，保证输出序列不变（见 §4 验证）。

### 方案 B：收成页面层共享组件/composable

把性别文案、排序放进一个 Vue composable（如 `useDisplay.ts`）或共享组件。

- **放弃什么**：**放弃导出与打印直接调用**——`exporter.ts` / `csv.ts` / `xlsx.ts` 是纯 TS，引用 Vue 响应式/composable 会把 DOM/Vue 依赖拖进写文件链路；要么仍在逻辑层再抄一份（重复没消除），要么让文件名/表格生成依赖组件运行时（命令行、单测无法直接调用）。
- **代价多大**：表面改动小（页面改 import 即可），实际只统一了「展示」一条路径，1.1 中导出那一套（`exporter.genderLabel`）与 1.2 时间戳无法并入，核心矛盾没有解决；打印稿通过组件共享也会混入响应式开销。
- **结论**：与「录入、规则、归并、导出、打印同时使用」「能被命令行直接调用」的硬要求冲突，**不采纳**。

### 空值取值与另一套的兼容

合并后取两套策略，**由调用路径显式选择，而不是全局统一**：

- 写文件：维持 `''`（`detailRows` 现有 `?? ''`、`formatCm` 对缺失返回 `''`）；
- 页面：维持 `—`（`ImportView` / `ExportView` 现有 `|| '—'`、`?? '—'`）；
- 共享层只提供判定（`genderTextOrDash` 负责三态），不替调用方决定空值字符。

这样不存在「另一套被废弃」，现有两条空值约定都保留，只是不再内联。

## 3. 排序：中文比较、稳定排序、空/缺字段

- **中文比较取哪一套**：取归并汇总已在用的**显式 `'zh-Hans-CN'`**（班级/车间、批次）。规则列表原来的**裸 `localeCompare` 不动 locale**——规则字段（`v1.0.0`、`2023-01-01`）是 ASCII，裸 locale 与 zh 结果相同，保留原样才能与旧存档读出的列表逐位一致。号型代码兜底（特殊档码 `PLUS/CUSTOM/TALL` 也是 ASCII）同样保留裸 `localeCompare`。
- **稳定排序**：不引入新算法。目标 `ES2020` 下 `Array.prototype.sort` 规范要求稳定（现代浏览器均满足）；`stableSorted` 内部就是 `[...list].sort(cmp)`，保留 Map 首次出现次序作为并列时的隐式次序。备货分布 `qty` 并列时靠 `compareSummaryRows` 裁决，与现状一致。
- **空/缺字段**：比较器不新增空值分支，沿用各数据入口已落定的兜底——班级 `orgUnit || '未填班级/车间'`、批次 `batch || '未分批'`（`merge.ts:181-182`，在入桶前替换，比较器看不到空串）；规则日期允许 `''`，空串按现状排在最前。合并只搬代码、不改这些兜底，避免对旧数据产生新排序。

## 4. 旧存档兼容分析（为什么不会走样）

IndexedDB 三个 store（`projects` / `rules` / `meta`，见 `idb.ts:8`）中**持久化的字段不含中文性别词、不含排序结果**：

- 落盘的是 `gender: 'male'|'female'` 与 `specialFlag` 代码（`PLUS` 等），中文只在展示层生成。共享 `genderText` 输出仍为 `男/女`，逐字不变。
- 项目在台账中的顺序每次读盘后由 `sortProjects()` **现算**（`updatedAt` 倒序）；规则列表顺序由比较器**现算**；汇总行/班级/批次/分布顺序由 `buildSummary()` **现算**。没有任何顺序数组被写入存档，因此换实现不迁移、不重排历史数据。
- 兼容的充要条件因此只有一条：**新比较器对任意输入的比较符号与旧内联实现一致**。保障方式：比较器逐行搬移（同 locale、同兜底、同并列裁决）+ §6 等价性脚本对拍。
- 不做数据迁移、不写版本标记、不改 IndexedDB schema（`DB_VERSION` 维持 1）。

## 5. 死工具的接线/删除后果（逐个）

**接线（接上需要它的地方，行为不变或仅内部实现变化）**

1. `fitRangeText` → RulesView 现有内联 `` `${r.fit} ${r.minCm}~${r.maxCm}` ``（`:169-170`、`fitText`）：输出同为 `Y 17~22` 形式，逐字不变；减少两处手拼。
2. `describeAlign` → RulesView `alignExamples`（`:40-52`）：该函数返回值就是 `formatHalfUnits(heightCodeUnits/chestCodeUnits(...))`，与示例现有计算完全相同，仅包一层。
3. `isRuleInUse` → RulesView 引用徽标：现为 `projectsUsingRule(v).length ? ... : ...`，`isRuleInUse` 内部就是 `length > 0`，布尔结果一致。
4. `idbPutMany` → `initStore` 补齐缺失内置规则：从循环 N 次 `idbPut`（N 个事务）改为一次事务多 put；写入的键值、顺序一致，仅事务次数减少（更快、原子性更好）。

**删除（无人调用，删除零用户可见后果）**

5. `stepCandidates`：无档位候选 UI；接线需新增界面元素，反而改变行为，删。
6. `ruleVersions`：无消费者；页面均直接遍历 `store.rules`。
7. `idbGet`：无单键读取场景（初始化全用 `getAll`）。
8. `todayStamp`：重复且无人调用的死时间戳；文件名时间戳统一由 `display.fileStamp` 提供。

## 6. 验收与回归手段

- `npm run build`（含 `vue-tsc --noEmit` 严格类型检查）必须通过。
- 新增一次性对拍脚本（node，不进构建产物）：用同一批含特殊档、男女、多班级/批次、空班级/批次、qty 并列的构造数据，比较「旧内联比较器」与「新共享比较器」排序后的序列逐位相同；时间戳对同一 `Date` 输出与旧 `stamp` 相同；`genderText` 对 `male/female` 输出 `男/女`。
- 手工冒烟路径（页面）：新建项目 → 录入含男女/特殊体型 → 导入预览（三态 `—`）→ 归并/覆写 → 汇总顺序与班级中文排序 → 导出 XLSX/CSV 文件名与行内容 → 打印稿表格。
- 文件名冻结断言：`项目名-下单汇总表-YYYYMMDD-HHMM.xlsx` 等既有格式不变；兜底 CSV 仍不带时间戳。

## 7. 实施记录（已完成）

新增 / 修改：

- 新增 `src/logic/display.ts`：`genderText`（男/女）、`genderTextOrDash`（三态）、`fileStamp`（`YYYYMMDD-HHMM`）。
- 新增 `src/logic/sort.ts`：`compareSummaryRows` / `compareDistribution` / `compareChineseName` / `compareRules` / `compareProjectsByUpdated` / `compareGender` / `stableSorted`。
- `merge.ts` 删除内联 `parseCode`、`compareRows`，四组排序全部改调共享比较器；`exporter.ts` 删除 `genderLabel` 与私有 `stamp`，改调共享实现（调用点输出不变）。
- 四个页面（Measure / Merge / Summary / Export）删除本地 `genderText`；Import 预览三态改调 `genderTextOrDash`；Merge 本地 `rowLabel` 改调 `exporter.summaryRowLabel`。
- `store.ts` 两处规则排序、项目台账排序改调共享比较器。
- 死工具处置：删除 `csv.todayStamp`、`store.ruleVersions`、`idbGet`、`stepCandidates`；接线 `fitRangeText`、`describeAlign`（RulesView 型别文案与边界示例）、`isRuleInUse`（引用徽标）、`idbPutMany`（`initStore` 补齐内置规则合并为单事务）。
- 等价性对拍：`scripts/consolidation-check.ts`（旧内联实现逐字复制后随机对拍 + 端到端 `buildSummary` 快照），`npm run check:consolidation` 运行。
- 未改 IndexedDB schema（`DB_VERSION` 仍为 1）、未做数据迁移；存档中不存中文词与排序结果，顺序全部现算，旧存档读回不走样。

验证结果：

- `npm run build`（含 `vue-tsc --noEmit` 严格模式）通过。
- `npm run check:consolidation` 通过：130 组随机输入下新老比较器序列逐位相同；时间戳、男/女/三态文案逐字相同；`buildSummary` 端到端快照（常规/特殊、男女、空班级批次兜底、守恒）一致。
- 已知环境差异（非缺陷）：node 自带 ICU 对 `zh-Hans-CN` 的中文次序与 Chrome 不同；生产仅在浏览器运行，新老比较器在同一运行时下结果一致，故中文次序不纳入 node 快照，浏览器内次序由同一比较器保证。
- 本机无无头浏览器工具链，页面级冒烟（按钮点击、下载文件名字符串）未在自动化中执行；建议手工过一遍 §6 的冒烟路径。
