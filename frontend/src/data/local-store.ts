import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'waste-to-energy-plant:entries'
// 铺底动作覆盖整库前的抄底备份，只保留最近一次，失败时能原样退回再重试。
const BACKUP_KEY = 'waste-to-energy-plant:entries:backup'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function backupKey(): string {
  return BACKUP_KEY
}

// 读出整库原始字符串：覆盖前抄底用，没有数据或环境不支持时返回 null。
export function readRawStorage(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  return window.localStorage.getItem(STORAGE_KEY)
}

// 把当前整库原样存一份到备份键；连写两次铺底也只保留最近一次快照。
// 空库也留痕（空串），回滚时按此删键，确保能退回「从没铺过」的初始态。
export function backupStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.setItem(BACKUP_KEY, readRawStorage() ?? '')
}

// 用快照把整库退回抄底时的样子；内存缓存一并作废，保证后续读到的是回退后的数据。
// 快照为空串表示铺前是空库：删掉主键，让应用重新播种示例数据。
export function restoreStorage(raw: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (raw === '') {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, raw)
    }
  }
  cache = null
}

// 整库原子替换：一次 setItem 落库，紧接着读回来核对，中途写坏/被截断直接抛错交给上层重试。
export function replaceAllRows(next: Record<string, EntryRow[]>): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    cache = next
    return
  }
  const serialized = JSON.stringify(next)
  window.localStorage.setItem(STORAGE_KEY, serialized)
  const verified = window.localStorage.getItem(STORAGE_KEY)
  if (verified !== serialized) {
    throw new Error('铺底数据写入浏览器存储后核对不一致，请重试一次')
  }
  cache = next
}
