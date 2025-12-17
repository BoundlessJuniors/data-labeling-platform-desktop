import './styles/tailwind.css'
import './styles/icons.css'
import './assets/base.css'

import { createApp } from 'vue'
import App from './App.vue'
import VueKonva from 'vue-konva'

createApp(App).use(VueKonva).mount('#app')
