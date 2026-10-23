import { createApp } from 'vue'
import App from './App.vue'
import { installVisitorHeaders } from './services/visitor'
import { applyTheme, resolveTheme } from './utils/theme'
import './styles/tokens.css'
import './styles.css'
import './styles/depth.css'
import './styles/editorial.css'

// 访客身份头要在任何 API 请求发出前装好（对 window.fetch 的包装）
installVisitorHeaders()

// 主题必须在挂载前挂好，否则会先闪一下默认底色（FOUC）
applyTheme(resolveTheme(), false)

createApp(App).mount('#app')
