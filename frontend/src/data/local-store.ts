import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'waste-to-energy-plant:entries'
// 铺底动作动手前的抄底备份：单独放一个键，中途失败可原样还原。
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

export function seedRowsClone(): Record<string, EntryRow[]> {
  return clone(SEED_ROWS)
}

// 整体写回：铺底动作一次铺多个模块，用整库替换并同步内存缓存。
export function saveAllRows(rows: Record<string, EntryRow[]>): void {
  cache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  }
}

// 抄底：把当前整库原始内容另存一份。还没写过库时，抄底内容就是首开时的示例数据。
export function backupStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  window.localStorage.setItem(BACKUP_KEY, raw ?? JSON.stringify(clone(SEED_ROWS)))
}

// 回滚：用抄底备份原样覆盖回去，并丢掉内存缓存，保证下次读到的是备份。
export function restoreStorage(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    cache = null
    return false
  }
  const backup = window.localStorage.getItem(BACKUP_KEY)
  if (backup === null) {
    return false
  }
  // 先丢缓存：万一写回也抛错，存储仍是铺底前的原样，下次读取不会拿到脏的内存数据。
  cache = null
  window.localStorage.setItem(STORAGE_KEY, backup)
  return true
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function backupStorageKey(): string {
  return BACKUP_KEY
}
