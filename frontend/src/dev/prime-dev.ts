import { isPrimed, primeDemoData, shouldAutoPrime } from '@/api/demo-prime'
import { listRows } from '@/data/local-store'

// 本地开发线专用：npm run dev 起页面后自动把演示数据铺进浏览器存储。
// 生产构建里 import.meta.env.DEV 为 false，本模块不会被 main.ts 引入。
export function installDemoPrime(): void {
  if (typeof window === 'undefined') {
    return
  }

  // 控制台手动入口 / 失败后再来一次：window.__primeDemoPlans()
  window.__primeDemoPlans = () => primeDemoData()

  // 已铺过，或本地已经有真实自编预案时不自动动数据；只在空表演示场景兜底。
  if (isPrimed() || !shouldAutoPrime(listRows('safetyplan'))) {
    return
  }
  const result = primeDemoData()
  if (result.ok) {
    // eslint-disable-next-line no-console
    console.info(`[演示铺底] ${result.message}；需要重跑可执行 window.__primeDemoPlans()`)
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[演示铺底] ${result.message}；可再执行 window.__primeDemoPlans() 重试`)
  }
}
