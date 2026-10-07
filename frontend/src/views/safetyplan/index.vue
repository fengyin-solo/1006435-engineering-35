<template>
  <section class="page" data-module="safetyplan">
    <header class="page-head">
      <div>
        <h2>应急预案管理管理</h2>
        <p class="page-desc">维护应急预案，围绕预案编号、预案名称、适用事故、编制人员做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记应急预案</button>
        <button v-if="isDev" class="btn" type="button" :disabled="seeding" @click="seedDemo">
          {{ seeding ? '铺底中…' : '铺底演示数据' }}
        </button>
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
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <button
              v-if="column === '预案编号'"
              class="link"
              type="button"
              :title="`查看「${row['预案名称']}」详情`"
              @click="openDetail(row)"
            >
              {{ row[column] ?? '—' }}
            </button>
            <template v-else>{{ row[column] ?? '—' }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
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
      <span>共 {{ total }} 条应急预案管理记录</span>
      <span v-if="seedMessage" :class="seedOk ? 'seed-ok' : 'error-text'">{{ seedMessage }}</span>
      <span v-else-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="detail" class="modal-mask" @click.self="closeDetail">
      <section class="modal-card" role="dialog" aria-modal="true" aria-label="应急预案详情">
        <header class="modal-head">
          <h3>{{ detail['预案名称'] }}</h3>
          <button class="btn ghost" type="button" @click="closeDetail">关闭</button>
        </header>
        <dl class="detail-list">
          <div v-for="column in columns" :key="column" class="detail-item">
            <dt>{{ column }}</dt>
            <dd>{{ detail[column] || '—' }}</dd>
          </div>
          <div class="detail-item">
            <dt>当前状态</dt>
            <dd>{{ detail.status }}</dd>
          </div>
        </dl>
        <footer class="modal-foot">
          <span class="status-legend">
            <span class="legend-item">清单待审核：{{ pendingReviewCount }}</span>
            <span class="legend-item">本预案{{ detail.pending ? '属于' : '不属于' }}待审核</span>
          </span>
          <button class="btn primary" type="button" @click="closeDetail">知道了</button>
        </footer>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
  seedDemoPlans,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const isDev = import.meta.env.DEV

const meta = moduleMeta('safetyplan')
const columns = ["预案编号", "预案名称", "适用事故", "编制人员", "审核人员", "发布单位", "修订日期", "预案状态"]
const actions = ["提交编制", "确认发布", "废止预案"]
const statuses = ["待编制", "待审核", "已发布", "已废止"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const seedMessage = ref('')
const seedOk = ref(false)
const seeding = ref(false)
const detail = ref<EntryRow | null>(null)
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const countByStatus = (status: string) =>
  rows.value.filter((row) => String(row.status) === status).length
const pendingReviewCount = computed(() => countByStatus('待审核'))
// 待审核数与行上的 pending 位同源：数据铺底时已统一校准，概览页读的也是这一份。
const stats = computed(() => [
  { label: "待编制预案", value: countByStatus('待编制') },
  { label: "待审核预案", value: pendingReviewCount.value },
  { label: "已发布预案", value: countByStatus('已发布') },
])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: countByStatus(status),
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

function openDetail(row: EntryRow) {
  detail.value = row
}

function closeDetail() {
  detail.value = null
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

function seedDemo() {
  if (seeding.value) {
    return
  }
  seeding.value = true
  seedMessage.value = ''
  try {
    const result = seedDemoPlans()
    seedOk.value = result.ok
    seedMessage.value = result.message
    if (result.ok) {
      errorMessage.value = ''
      detail.value = null
      reload()
    }
  } catch (error) {
    seedOk.value = false
    seedMessage.value = error instanceof Error ? error.message : '演示数据铺底失败，可再试一次'
  } finally {
    seeding.value = false
  }
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    if (detail.value) {
      detail.value = rows.value.find((row) => Number(row.id) === Number(detail.value?.id)) ?? null
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '应急预案管理列表读取失败'
  }
}

onMounted(() => {
  // 本地开发也可以直接在控制台执行 window.__seedDemoPlans() 完成铺底。
  if (isDev) {
    ;(window as unknown as { __seedDemoPlans?: typeof seedDemoPlans }).__seedDemoPlans = seedDemoPlans
  }
  reload()
})
</script>

<style scoped>
.page-actions {
  display: flex;
  gap: 8px;
}
.seed-ok {
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
  width: min(640px, 92vw);
  max-height: 84vh;
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 16px 18px;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.modal-head h3 {
  margin: 0;
  font-size: 16px;
}
.detail-list {
  margin: 12px 0;
}
.detail-item {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
  font-size: 13px;
}
.detail-item dt {
  width: 88px;
  flex: none;
  color: var(--muted);
}
.detail-item dd {
  margin: 0;
}
.modal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.modal-foot .status-legend {
  margin: 0;
}
</style>
