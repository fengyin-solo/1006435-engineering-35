import { MODULE_BY_KEY, MODULES } from '@/data/modules'
import {
  allRows,
  backupStorage,
  backupStorageKey,
  listRows,
  resetRows,
  restoreStorage,
  saveAllRows,
  saveRows,
  seedRowsClone,
} from '@/data/local-store'
import { DEMO_SAFETY_PLANS, toDemoRow } from '@/data/demo-safety-plan'
import type {
  ActionResult,
  DemoSeedResult,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// 本地演示铺底：先抄底备份，再把运营概览复位回初始态，应急预案按事故类型写入示例。
// 幂等：同一预案编号只更新不新增；兼容：本地既有的真实预案原样保留；失败自动回滚，可重试。
export function seedDemoPlans(): DemoSeedResult {
  backupStorage()

  try {
    // 概览复位：以仓库自带示例数据为底，覆盖掉浏览器里遗留的空数组/脏数据。
    const baseline = seedRowsClone()

    // 占位预案编号集合：这几条是仓库自动生成的"样例N"占位行，演示铺底时由真实预案替掉，
    // 本地另外登记的真实预案不在此列，一律保留。
    const placeholderCodes = new Set(
      (baseline.safetyplan ?? []).map((row) => String(row['预案编号'] ?? '')),
    )
    const existing = (listRows('safetyplan') ?? []).filter(
      (row) => !placeholderCodes.has(String(row['预案编号'] ?? '')),
    )

    const byCode = new Map<string, EntryRow>()
    const noCodeRows: EntryRow[] = []
    for (const row of existing) {
      const code = String(row['预案编号'] ?? '').trim()
      if (code) {
        byCode.set(code, row)
      } else {
        // 编号缺失的既有行不参与按编号去重，原样保留，避免互相覆盖。
        noCodeRows.push(row)
      }
    }

    let nextId = existing.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0)
    let inserted = 0
    let updated = 0
    for (const demo of DEMO_SAFETY_PLANS) {
      const found = byCode.get(demo.预案编号)
      if (found) {
        byCode.set(demo.预案编号, { ...found, ...toDemoRow(demo, Number(found.id)) })
        updated += 1
      } else {
        nextId += 1
        byCode.set(demo.预案编号, toDemoRow(demo, nextId))
        inserted += 1
      }
    }

    // 统一校准待办位：待审核才算待处理，保证清单、详情、概览三处待审核数同源一致；
    // 异常位不动用户既有标记，演示行本身不带异常。
    const plans = [...noCodeRows, ...byCode.values()].map((row) => ({
      ...row,
      pending: String(row.status) === '待审核',
    }))
    plans.sort((a, b) => Number(a.id) - Number(b.id))
    baseline.safetyplan = plans

    saveAllRows(baseline)

    // 写后自检：概览口径的待处理数必须等于预案页待审核数，不一致就视为本次铺底失败。
    const pendingReview = plans.filter((row) => row.pending).length
    const overviewPending = (allRows().safetyplan ?? []).filter((row) => row.pending).length
    if (overviewPending !== pendingReview) {
      throw new Error('铺底后预案待审核数与运营概览不一致')
    }

    return {
      ok: true,
      message: `演示数据已铺好：应急预案 ${plans.length} 条（新增 ${inserted} 条、更新 ${updated} 条），运营概览已复位，可刷新任意页面查看。`,
      planCount: plans.length,
      inserted,
      updated,
      pendingReview,
      resetModules: MODULES.length,
      backupKey: backupStorageKey(),
    }
  } catch (error) {
    // 中途失败：能回滚就抄底还原，回滚也失败则丢掉内存缓存逼下次从存储重读，随时可再试一次。
    let restored = false
    try {
      restored = restoreStorage()
    } catch {
      restored = false
    }
    if (!restored) {
      try {
        allRows()
      } catch {
        // 存储和缓存都不可用时交给下次重试，这里不再抛出。
      }
    }
    const reason = error instanceof Error ? error.message : '未知错误'
    return {
      ok: false,
      message: restored
        ? `演示数据铺底失败，已还原铺底前的数据，可再试一次：${reason}`
        : `演示数据铺底失败且未能还原备份，请清理浏览器存储后重试：${reason}`,
      planCount: 0,
      inserted: 0,
      updated: 0,
      pendingReview: 0,
      resetModules: 0,
      backupKey: backupStorageKey(),
    }
  }
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
