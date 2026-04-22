<script setup lang="ts">
import { ref } from 'vue'
import SunIcon from '@renderer/assets/icons/custom/light_mode.svg?component'
import MoonIcon from '@renderer/assets/icons/custom/dark_mode.svg?component'
import TimerIcon from '@renderer/assets/icons/custom/timer.svg?component'
import SaveIcon from '@renderer/assets/icons/custom/cloud_done.svg?component'
import ApproveIcon from '@renderer/assets/icons/custom/approval_delegation.svg?component'

defineProps<{
  taskTitleText: string
  globalSeconds: number
  autoSaveProgress: number
}>()

const emit = defineEmits<{
  (e: 'theme-toggle'): void
  (e: 'save'): void
  (e: 'complete-local'): void
}>()

const saveBtn = ref<HTMLButtonElement | null>(null)
defineExpose({ saveBtn })

function formatTime(total: number): string {
  const sec = Math.max(0, Math.floor(total))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
</script>

<template>
  <header
    class="flex items-center justify-between px-6 py-4 border-b border-border/50 dark:border-white/5 bg-surface/80 dark:bg-[#0f1115]/80 backdrop-blur-md z-10"
  >
    <div class="flex items-center gap-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white">
        {{ taskTitleText }}
      </h2>
    </div>

    <div class="flex items-center gap-3">
      <button
        class="relative inline-flex items-center h-7 w-12 shrink-0 rounded-full bg-slate-200 dark:bg-white/10 mr-2 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
        @click="emit('theme-toggle')"
      >
        <span
          class="absolute left-1 top-1 h-5 w-5 bg-white dark:bg-gray-800 rounded-full shadow-sm transform transition-transform duration-300 dark:translate-x-5 flex items-center justify-center"
        >
          <SunIcon class="ui-svg h-3.5 w-3.5 text-amber-500 opacity-100 dark:opacity-0" />
          <MoonIcon class="ui-svg h-3 w-3 text-blue-400 absolute opacity-0 dark:opacity-100" />
        </span>
      </button>

      <div
        class="flex items-center gap-1.5 pl-3 pr-4 py-1.5 bg-slate-100/80 dark:bg-white/5 rounded-full border border-slate-200/60 dark:border-white/5"
      >
        <TimerIcon class="ui-svg h-4 w-4 text-slate-400 dark:text-gray-400" />
        <div
          class="font-mono text-sm font-semibold text-slate-700 dark:text-gray-200 tracking-tight"
        >
          {{ formatTime(globalSeconds) }}
        </div>
      </div>

      <button
        ref="saveBtn"
        class="flex items-center gap-2 rounded-xl bg-white dark:bg-[#1c1f26] border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 py-2 px-4 text-sm font-semibold save-auto-btn shadow-sm transition-all"
        :style="{ '--save-progress': String(autoSaveProgress) }"
        @click="emit('save')"
      >
        <SaveIcon class="ui-svg h-4 w-4 text-slate-400 dark:text-gray-400" />
        <span>Save Draft</span>
      </button>

      <button
        class="flex items-center gap-2 rounded-xl bg-primary py-2 px-4 text-sm font-semibold text-white hover:bg-primary-light shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all hover:-translate-y-px"
        @click="emit('complete-local')"
      >
        <ApproveIcon class="ui-svg h-4 w-4 text-white" />
        <span>Mark as Complete</span>
      </button>
    </div>
  </header>
</template>
