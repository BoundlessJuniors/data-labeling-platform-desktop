<script setup lang="ts">
import { ref } from 'vue'
import ArrowBackIcon from '@renderer/assets/icons/custom/arrow_back.svg?component'
import ArrowFwdIcon from '@renderer/assets/icons/custom/arrow_forward.svg?component'
import TimerIcon from '@renderer/assets/icons/custom/timer.svg?component'
import FilterIcon from '@renderer/assets/icons/custom/filter_list.svg?component'
import type { Task } from '@renderer/types/annotation'

const props = defineProps<{
  tasks: Task[]
  currentTaskIndex: number
  taskSecondsById: Record<string, number>
}>()

const emit = defineEmits<{
  (e: 'navigate', index: number): void
  (e: 'prev'): void
  (e: 'next'): void
}>()

const tasksNav = ref<HTMLElement | null>(null)
const prevBtn = ref<HTMLButtonElement | null>(null)
const nextBtn = ref<HTMLButtonElement | null>(null)
const filterBtn = ref<HTMLButtonElement | null>(null)
const filterDropdown = ref<HTMLDivElement | null>(null)

defineExpose({
  tasksNav,
  prevBtn,
  nextBtn,
  filterBtn,
  filterDropdown
})

function getTaskMediaId(t: Task): string {
  return t.mediaId ?? t.title ?? String(t.id)
}

function getTaskSeconds(t: Task): number {
  const id = getTaskMediaId(t)
  return props.taskSecondsById[id] ?? 0
}

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
  <aside
    class="flex flex-col w-72 bg-surface/90 dark:bg-[#161920]/90 backdrop-blur-md border-r border-border/50 dark:border-white/5 z-10 shadow-[2px_0_12px_rgba(0,0,0,0.02)]"
  >
    <div class="px-6 py-5">
      <h1
        class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-light"
      >
        LabelGun
      </h1>
    </div>

    <nav ref="tasksNav" class="flex-1 px-4 space-y-3 overflow-y-auto pb-4 tasks-scroll">
      <div
        class="px-1 mb-2 flex items-center justify-between text-[11px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider"
      >
        <h2>Tasks</h2>
        <div class="flex items-center gap-1">
          <button
            ref="prevBtn"
            class="p-1 rounded-md bg-slate-100 dark:bg-gray-800 hover:bg-slate-200"
            title="Previous Task (←)"
            @click="emit('prev')"
          >
            <ArrowBackIcon class="ui-svg h-4 w-4 text-gray-700 dark:text-gray-200" />
          </button>
          <button
            ref="nextBtn"
            class="p-1 rounded-md bg-slate-100 dark:bg-gray-800 hover:bg-slate-200"
            title="Next Task (→)"
            @click="emit('next')"
          >
            <ArrowFwdIcon class="ui-svg h-4 w-4 text-gray-700 dark:text-gray-200" />
          </button>
        </div>
      </div>
      <ul class="space-y-3">
        <li v-for="(t, idx) in tasks" :key="t.id">
          <a
            href="#"
            :data-active="idx === currentTaskIndex ? 'true' : null"
            :class="[
              'block rounded-xl overflow-hidden border transition-all duration-200',
              idx === currentTaskIndex
                ? 'border-primary/40 dark:border-primary/30 bg-primary/5 dark:bg-primary/10 shadow-[0_2px_12px_rgba(37,99,235,0.08)] ring-1 ring-primary/20'
                : 'border-border/60 dark:border-white/5 bg-surface dark:bg-[#1c1f26] hover:border-border dark:hover:border-white/10 hover:shadow-sm'
            ]"
            @click.prevent="emit('navigate', idx)"
          >
            <div
              class="h-20 bg-slate-100/50 dark:bg-white/5 flex items-center justify-center border-b border-border/40 dark:border-white/5"
            >
              <span class="text-xs font-medium text-slate-400 dark:text-gray-500 antialiased"
                >Image preview</span
              >
            </div>
            <div class="p-3 flex flex-col">
              <div class="flex justify-between items-start mb-1.5">
                <span
                  class="text-sm font-semibold text-slate-700 dark:text-gray-200 truncate pr-2"
                  >{{ t.title }}</span
                >

                <span
                  v-if="t.status === 'in_progress'"
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 whitespace-nowrap"
                  >In Progress</span
                >

                <span
                  v-else-if="t.status === 'completed'"
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 whitespace-nowrap"
                  >Completed</span
                >

                <span
                  v-else
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-gray-400 whitespace-nowrap"
                  >Queued</span
                >
              </div>

              <!-- Sync Errors -->
              <div
                v-if="t.syncStatus === 'missing_annotation'"
                class="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-md w-fit"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Missing Export
              </div>
              <div
                v-else-if="t.syncStatus === 'lease_expired'"
                class="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-md w-fit"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <path
                    d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Lease Expired
              </div>
              <div
                v-else-if="t.syncStatus === 'failed_permanent'"
                class="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-md w-fit"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                Failed
              </div>
              <div
                v-else-if="t.syncStatus === 'pending_insert'"
                class="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded-md w-fit"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <path
                    d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9"
                  />
                </svg>
                Pending
              </div>

              <div
                class="text-[11px] font-medium text-slate-400 dark:text-gray-500 flex items-center gap-1"
              >
                <TimerIcon class="w-3 h-3 ui-svg opacity-70" />
                {{ formatTime(getTaskSeconds(t)) }}
              </div>
            </div>
          </a>
        </li>
      </ul>
    </nav>

    <div
      class="p-4 border-t border-border/50 dark:border-white/5 relative bg-surface/90 dark:bg-[#161920]/90 backdrop-blur-sm"
    >
      <button
        ref="filterBtn"
        class="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10 py-2.5 px-4 text-sm font-semibold transition-colors"
      >
        <FilterIcon class="ui-svg h-4 w-4" />
        <span>Filter Tasks</span>
      </button>
      <div ref="filterDropdown" class="absolute bottom-full mb-2 w-full left-0 px-4">
        <!-- demo dropdown -->
      </div>
    </div>
  </aside>
</template>
