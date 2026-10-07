<template>
  <section class="page" data-module="safetyplan">
    <header class="page-head">
      <div>
        <h2>应急预案管理管理</h2>
        <p class="page-desc">维护应急预案，围绕预案编号、预案名称、适用事故、编制人员做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记应急预案</button>
        <button v-if="isDev" class="btn" type="button" @click="runPrime">铺底演示预案</button>
        <button class="btn" type="button" @click="exportRows">导出应急预案管理清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="String(row.id)"
          class="data-row"
          role="button"
          tabindex="0"
          @click="openDetail(row)"
          @keydown.enter.prevent="openDetail(row)"
        >
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click.stop="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无应急预案管理数据，可先登记应急预案</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条应急预案管理记录，点击任意一行可查看详情</span>
      <span v-if="primeMessage" :class="primeOk ? 'success-text' : 'error-text'">{{ primeMessage }}</span>
      <span v-else-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="detailRow" class="modal-mask" @click.self="closeDetail">
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="应急预案详情">
        <header class="modal-head">
          <h3>应急预案详情</h3>
          <button class="btn ghost" type="button" @click="closeDetail">关闭</button>
        </header>
        <dl class="detail-list">
          <div v-for="field in detailFields" :key="field" class="detail-item">
            <dt>{{ field }}</dt>
            <dd>{{ detailRow[field] ?? '—' }}</dd>
          </div>
          <div class="detail-item">
            <dt>当前状态</dt>
            <dd>{{ detailRow.status }}</dd>
          </div>
        </dl>
        <p class="detail-check">
          当前全厂待审核预案 {{ pendingReviewCount }} 份，清单统计卡与运营概览口径一致
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  ENTRIES_PRIMED_EVENT,
  countByStatus,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('safetyplan')
const columns = ["预案编号", "预案名称", "适用事故", "编制人员", "审核人员", "发布单位", "修订日期", "预案状态"]
const actions = ["提交编制", "确认发布", "废止预案"]
const statuses = ["待编制", "待审核", "已发布", "已废止"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const isDev = import.meta.env.DEV
const primeMessage = ref('')
const primeOk = ref(false)

const detailRow = ref<EntryRow | null>(null)
const detailFields = columns

// 统计卡实时取数：待审核数与运营概览「待处理」、详情页提示共用同一口径。
const statusCounts = ref<Record<string, number>>({})
const stats = computed(() => [
  { label: "待编制预案", value: statusCounts.value["待编制"] ?? 0 },
  { label: "待审核预案", value: statusCounts.value["待审核"] ?? 0 },
  { label: "已发布预案", value: statusCounts.value["已发布"] ?? 0 },
])
const pendingReviewCount = computed(() => statusCounts.value["待审核"] ?? 0)

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '应急预案登记入口尚未接入审批流'
}

// 任意状态的预案都能点开，包括还停在「待编制」的草稿。
function openDetail(row: EntryRow) {
  detailRow.value = row
}

function closeDetail() {
  detailRow.value = null
}

async function runPrime() {
  primeMessage.value = ''
  errorMessage.value = ''
  try {
    const { primeDemoData } = await import('@/api/demo-prime')
    const result = primeDemoData()
    primeOk.value = result.ok
    primeMessage.value = result.message
    // 成功时事件监听会统一 reload；失败时保持现有列表不动，可再点一次。
  } catch (error) {
    primeOk.value = false
    primeMessage.value = error instanceof Error ? error.message : '铺底动作执行失败，请再试一次'
  }
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    statusCounts.value = countByStatus(meta.key)
    if (detailRow.value) {
      detailRow.value = rows.value.find((row) => Number(row.id) === Number(detailRow.value?.id)) ?? null
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '应急预案管理列表读取失败'
  }
}

onMounted(() => {
  reload()
  window.addEventListener(ENTRIES_PRIMED_EVENT, reload)
})

onUnmounted(() => {
  window.removeEventListener(ENTRIES_PRIMED_EVENT, reload)
})
</script>

<style scoped>
.page-actions {
  display: flex;
  gap: 8px;
}
.data-row {
  cursor: pointer;
}
.success-text {
  color: #067647;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.modal-card {
  width: 640px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 16px 20px;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.modal-head h3 {
  margin: 0;
  font-size: 16px;
}
.detail-list {
  margin: 0;
}
.detail-item {
  display: flex;
  gap: 12px;
  border-bottom: 1px dashed var(--border);
  padding: 8px 0;
  font-size: 13px;
}
.detail-item dt {
  width: 84px;
  flex: none;
  color: var(--muted);
}
.detail-item dd {
  margin: 0;
}
.detail-check {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
