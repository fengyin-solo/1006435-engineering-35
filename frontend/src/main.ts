import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// 仅本地开发线：自动检查并铺底演示数据（空表才铺，已有真实预案不覆盖）。
if (import.meta.env.DEV) {
  void import('./dev/prime-dev').then(({ installDemoPrime }) => installDemoPrime())
}
