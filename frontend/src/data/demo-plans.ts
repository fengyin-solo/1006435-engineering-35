import type { EntryRow } from './types'

// 演示用应急预案：按事故类型铺开，预案编号 / 名称 / 适用事故都是可直接宣讲的成句。
// 铺底动作按「预案编号」归并这些条目：连着跑也只会原地更新，不会堆出重复预案。
// 状态分布与 pending 标记对齐：待审核 = pending(true)，待编制与已发布 = pending(false)，
// 这样预案清单、详情与运营概览的待审核数天然一致。
export type DemoPlan = {
  code: string
  name: string
  accident: string
  status: string
  editor: string
  reviewer: string
  publisher: string
  revisedAt: string
}

export const DEMO_PLANS: DemoPlan[] = [
  {
    code: 'SAFE-2026-001',
    name: '垃圾池火灾爆炸事故专项应急预案',
    accident: '垃圾池自燃、沼气积聚引发的火灾爆炸',
    status: '已发布',
    editor: '周明远',
    reviewer: '李建国',
    publisher: '安全生产委员会',
    revisedAt: '2026-08-15',
  },
  {
    code: 'SAFE-2026-002',
    name: '余热锅炉超压爆炸专项应急预案',
    accident: '锅炉超压、缺水爆管等压力容器事故',
    status: '已发布',
    editor: '周明远',
    reviewer: '李建国',
    publisher: '安全生产委员会',
    revisedAt: '2026-08-18',
  },
  {
    code: 'SAFE-2026-003',
    name: '烟气超标排放环境应急预案',
    accident: '净化系统故障导致的二氧化硫、二噁英等烟气超标排放',
    status: '已发布',
    editor: '陈晓岚',
    reviewer: '李建国',
    publisher: '环保管理部',
    revisedAt: '2026-08-20',
  },
  {
    code: 'SAFE-2026-004',
    name: '全厂停电事故专项应急预案',
    accident: '外电网跳闸、厂用电中断引发的全厂停电',
    status: '已发布',
    editor: '赵立群',
    reviewer: '李建国',
    publisher: '安全生产委员会',
    revisedAt: '2026-08-25',
  },
  {
    code: 'SAFE-2026-005',
    name: '危险化学品泄漏专项应急预案',
    accident: '氨水、柴油、石灰浆等危化品泄漏与人员中毒',
    status: '已发布',
    editor: '陈晓岚',
    reviewer: '王海涛',
    publisher: '环保管理部',
    revisedAt: '2026-08-28',
  },
  {
    code: 'SAFE-2026-006',
    name: '有限空间作业中毒窒息应急预案',
    accident: '垃圾池、渗滤液池等有限空间中毒窒息事故',
    status: '待审核',
    editor: '周明远',
    reviewer: '王海涛',
    publisher: '安全生产委员会',
    revisedAt: '2026-09-02',
  },
  {
    code: 'SAFE-2026-007',
    name: '渗滤液站泄漏突发环境事件应急预案',
    accident: '渗滤液调节池渗漏、出水超标造成的水环境污染',
    status: '待审核',
    editor: '陈晓岚',
    reviewer: '李建国',
    publisher: '环保管理部',
    revisedAt: '2026-09-05',
  },
  {
    code: 'SAFE-2026-008',
    name: '极端天气防汛防台专项应急预案',
    accident: '暴雨、台风等极端天气导致的厂区内涝与设备停运',
    status: '待编制',
    editor: '赵立群',
    reviewer: '王海涛',
    publisher: '安全生产委员会',
    revisedAt: '2026-09-06',
  },
]

// 待审核状态：清单统计卡与运营概览「待处理」都按它计数。
export const PLAN_PENDING_REVIEW_STATUS = '待审核'

export function demoPlanRows(): EntryRow[] {
  return DEMO_PLANS.map((item, index) => ({
    id: index + 1,
    status: item.status,
    pending: item.status === PLAN_PENDING_REVIEW_STATUS,
    abnormal: false,
    预案编号: item.code,
    预案名称: item.name,
    适用事故: item.accident,
    编制人员: item.editor,
    审核人员: item.reviewer,
    发布单位: item.publisher,
    修订日期: item.revisedAt,
    预案状态: item.status,
  }))
}
