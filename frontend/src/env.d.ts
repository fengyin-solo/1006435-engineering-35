/// <reference types="vite/client" />

import type { PrimeDemoResult } from './api/demo-prime'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE?: string
    readonly VITE_APP_NAME?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    // 本地开发线的演示铺底入口：失败后可在控制台再执行一次。
    __primeDemoPlans?: () => PrimeDemoResult
  }
}

export {}
