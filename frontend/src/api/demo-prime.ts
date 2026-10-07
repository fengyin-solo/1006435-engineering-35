import { ENTRIES_PRIMED_EVENT } from '@/api/local-service'
import {
  backupKey,
  backupStorage,
  readRawStorage,
  replaceAllRows,
  restoreStorage,
} from '@/data/local-store'
import {
  DEMO_PLANS,
  PLAN_PENDING_REVIEW_STATUS,
  demoPlanRows,
} from '@/data/demo-plans'
import { SEED_ROWS } from '@/data/seed'
import { MODULE_BY_KEY } from '@/data/modules'
import type { EntryRow } from '@/data/types'

// 本地开发线的演示铺底：
// 1) 其他 17 个模块复位回示例初始态，运营概览随之回到「有数据可看」的初始基线；
// 2) 应急预案按事故类型铺开演示条目，预案编号 / 名称 / 适用事故一并写好；
// 3) 兼容本地既有预案：脚手架占位行替换掉，真实自编预案原样保留；
// 4) 动手前把整库抄底备份，覆盖后核对，失败自动退回快照，可以再跑一次；
// 5) 按预案编号幂等归并，连着跑也只是原地更新，不会堆出重复条目。

export const DEMO_PRIME_MARKER_KEY = 'waste-to-energy-plant:demo-prime:v1'
const SAFETYPLAN_KEY = 'safetyplan'

export type PrimeDemoResult = {
  ok: boolean
  message: string
  planTotal: number
  pendingReview: number
  draft: number
  published: number
  preserved: number
  replacedScaffolds: number
  restoredFromBackup: boolean
  retriable: boolean
}

// 仓库初始化时生成的脚手架占位数据：演示前清掉，给按事故类型的演示预案腾位。
function isScaffoldRow(row: EntryRow): boolean {
  return (
    typeof row['预案名称'] === 'string' &&
    row['预案名称'].startsWith('应急预案管理样例')
  )
}

function isDemoPlanRow(row: EntryRow): boolean {
  // 用完整签名认人：编号/名称/适用事故与演示条目完全一致才是铺底行，
  // 这样「编号恰好撞车的本地自编预案」不会被误吞，第二遍重跑铺底行也能原地归并。
  return DEMO_PLANS.some(
    (item) =>
      row['预案编号'] === item.code &&
      row['预案名称'] === item.name &&
      row['适用事故'] === item.accident,
  )
}

function nextPlanId(used: Set<number>): number {
  let id = 1
  while (used.has(id)) {
    id += 1
  }
  used.add(id)
  return id
}

// 合并演示预案与本地既有预案：演示条目按编号幂等归并，其余真实记录保留并规范 pending 口径。
export function mergeSafetyPlans(existing: EntryRow[]): {
  rows: EntryRow[]
  preserved: number
  replacedScaffolds: number
} {
  const replacedScaffolds = existing.filter(isScaffoldRow).length

  // 先放下铺底演示预案，连着跑时它们的 id 固定为 1..N。
  const rows = demoPlanRows()
  const usedIds = new Set(rows.map((row) => Number(row.id)))
  const demoCodes = new Set(DEMO_PLANS.map((item) => item.code))

  let preserved = 0
  for (const row of existing) {
    if (isScaffoldRow(row)) {
      continue
    }
    // 铺底行本身：连着跑时原地丢弃旧拷贝、以新演示定义为准，保证幂等不堆叠。
    if (isDemoPlanRow(row)) {
      continue
    }
    // 真实自编预案：编号撞上演示编号则让位改名，避免唯一键重复；id 冲突则重新分配。
    let id = Number(row.id)
    if (!Number.isInteger(id) || id <= 0 || usedIds.has(id)) {
      id = nextPlanId(usedIds)
    } else {
      usedIds.add(id)
    }
    const code = String(row['预案编号'] ?? '')
    // 走到这里的都不是铺底行：编号与演示预案撞车时让位改名，保证编号唯一。
    const normalizedCode = demoCodes.has(code) ? `${code}-本地` : code
    const status = String(row.status ?? '待编制')
    rows.push({
      ...row,
      id,
      status,
      // 与演示条目同一口径：只有「待审核」计入待处理，待编制草稿不占待审核数。
      pending: status === PLAN_PENDING_REVIEW_STATUS,
      预案编号: normalizedCode,
    })
    preserved += 1
  }
  return { rows, preserved, replacedScaffolds }
}

// 落库后对账：清单 / 详情 / 概览展示的待审核数必须与 pending 标记完全一致。
function assertConsistency(rows: EntryRow[]): { pendingReview: number; draft: number; published: number } {
  const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
    const status = String(row.status)
    acc[status] = (acc[status] ?? 0) + 1
    return acc
  }, {})
  const pendingReview = byStatus[PLAN_PENDING_REVIEW_STATUS] ?? 0
  const pendingFlags = rows.filter((row) => row.pending).length
  if (pendingReview !== pendingFlags) {
    throw new Error(`铺底后自检不一致：待审核 ${pendingReview} 条，但待处理标记有 ${pendingFlags} 条`)
  }
  if (rows.some((row) => !row['预案编号'] || !row['预案名称'] || !row['适用事故'])) {
    throw new Error('铺底后自检不一致：存在预案编号、名称或适用事故为空的条目')
  }
  return {
    pendingReview,
    draft: byStatus['待编制'] ?? 0,
    published: byStatus['已发布'] ?? 0,
  }
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : '铺底动作执行失败'
}

// 执行一次铺底。失败时先把整库退回覆盖前的抄底快照，再抛出结果，调用方直接再跑一次即可。
export function primeDemoData(): PrimeDemoResult {
  const snapshot = readRawStorage()
  let restoredFromBackup = false
  try {
    backupStorage()

    // 复位回初始态：其余模块整库回到示例基线，运营概览不再全是零。
    const next: Record<string, EntryRow[]> = {}
    for (const key of MODULE_BY_KEY.keys()) {
      next[key] = key === SAFETYPLAN_KEY ? [] : JSON.parse(JSON.stringify(SEED_ROWS[key] ?? []))
    }

    const current = (snapshot !== null ? safeParse(snapshot) : null)?.[SAFETYPLAN_KEY]
      ?? JSON.parse(JSON.stringify(SEED_ROWS[SAFETYPLAN_KEY] ?? []))
    const merged = mergeSafetyPlans(Array.isArray(current) ? current : [])
    next[SAFETYPLAN_KEY] = merged.rows

    // 一次写入 + 读回核对，保证不是半写状态。
    replaceAllRows(next)

    const counts = assertConsistency(merged.rows)
    markPrimed()
    notifyPrimed()

    return {
      ok: true,
      message:
        `演示预案已铺底：共 ${merged.rows.length} 条（待审核 ${counts.pendingReview} 条），` +
        `运营概览已复位到初始基线；保留本地预案 ${merged.preserved} 条，覆盖前数据已抄底备份`,
      planTotal: merged.rows.length,
      pendingReview: counts.pendingReview,
      draft: counts.draft,
      published: counts.published,
      preserved: merged.preserved,
      replacedScaffolds: merged.replacedScaffolds,
      restoredFromBackup: false,
      retriable: false,
    }
  } catch (error) {
    try {
      if (snapshot !== null) {
        restoreStorage(snapshot)
        restoredFromBackup = true
      }
    } catch {
      // 回滚本身失败时保留备份键，提示手工恢复，不掩盖最初的错误。
    }
    return {
      ok: false,
      message:
        `${failureMessage(error)}；` +
        (restoredFromBackup
          ? '已退回铺底前的抄底快照，可以直接再执行一次。'
          : `数据未完成覆盖，可从浏览器存储 ${backupKey()} 取回快照后再试一次。`),
      planTotal: 0,
      pendingReview: 0,
      draft: 0,
      published: 0,
      preserved: 0,
      replacedScaffolds: 0,
      restoredFromBackup,
      retriable: true,
    }
  }
}

function safeParse(raw: string): Record<string, EntryRow[]> | null {
  try {
    return JSON.parse(raw) as Record<string, EntryRow[]>
  } catch {
    return null
  }
}

function markPrimed(): void {
  try {
    window.localStorage.setItem(DEMO_PRIME_MARKER_KEY, new Date().toISOString())
  } catch {
    // 标记写不进去不影响铺底本身，下次进入仍会再判一次。
  }
}

function notifyPrimed(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(ENTRIES_PRIMED_EVENT))
  }
}

export function isPrimed(): boolean {
  try {
    return window.localStorage.getItem(DEMO_PRIME_MARKER_KEY) !== null
  } catch {
    return false
  }
}

// 自动铺底判定：空表（含只有脚手架占位行的仓库初始态）才补；
// 已经有本地自编预案说明用户在干活，绝不自动覆盖，需要时再由人手动执行。
export function shouldAutoPrime(safetyRows: EntryRow[]): boolean {
  if (isPrimed()) {
    return false
  }
  return safetyRows.filter((row) => !isScaffoldRow(row)).length === 0
}
