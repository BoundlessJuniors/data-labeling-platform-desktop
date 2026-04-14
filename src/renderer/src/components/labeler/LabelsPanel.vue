<script setup lang="ts">
import SearchIcon from '@renderer/assets/icons/custom/search.svg?component'
import CloseIcon from '@renderer/assets/icons/custom/close.svg?component'
import type { LabelDefinition as Label } from '@renderer/types/annotation'

defineProps<{
  labelingLoadError: string | null
  showLabelHint: boolean
  labelSearchTerm: string
  isCloudLabelsReadOnly: boolean
  filteredLabels: Label[]
  activeLabel: string | null
  canManageLocalLabels: boolean
  newLabelName: string
}>()

const emit = defineEmits<{
  (e: 'update:labelSearchTerm', val: string): void
  (e: 'update:newLabelName', val: string): void
  (e: 'set-active-label', name: string): void
  (e: 'delete-label', id: string): void
  (e: 'add-label'): void
}>()

function onSearchInput(e: Event): void {
  emit('update:labelSearchTerm', (e.target as HTMLInputElement).value)
}

function onNewLabelInput(e: Event): void {
  emit('update:newLabelName', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div
    class="bg-white/60 dark:bg-[#161920]/80 backdrop-blur-sm p-4 rounded-xl border border-slate-200/80 dark:border-white/5 shadow-sm flex flex-col shrink-0"
  >
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-800 dark:text-gray-200 tracking-wide uppercase">
        Labels
      </h3>
    </div>

    <div
      v-if="labelingLoadError"
      class="mb-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-md text-sm"
    >
      <strong class="font-bold">Error Loading Labels:</strong><br />
      {{ labelingLoadError }}
    </div>

    <p v-if="showLabelHint && !labelingLoadError" class="text-xs text-amber-500 mb-2">
      Lütfen önce bir label seçin.
    </p>
    <div v-if="!labelingLoadError" class="relative mb-3">
      <SearchIcon class="ui-svg h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        :value="labelSearchTerm"
        type="search"
        placeholder="Search..."
        class="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-slate-400"
        @input="onSearchInput"
      />
    </div>

    <div
      v-if="isCloudLabelsReadOnly"
      class="mb-3 text-[11px] uppercase tracking-wide text-blue-600 font-bold bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 p-2 rounded-lg flex items-center justify-center border border-blue-100 dark:border-blue-500/20"
    >
      <span>Cloud Contract (Read-only)</span>
    </div>

    <div class="flex flex-wrap gap-1.5 mb-3 max-h-32 overflow-y-auto p-0.5">
      <span
        v-for="lbl in filteredLabels"
        :key="lbl.id"
        class="cursor-pointer text-xs font-semibold px-2 py-1 rounded-md label-item flex items-center gap-1.5 transition-all border group/chip"
        :class="[
          activeLabel === lbl.name
            ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
            : 'bg-white dark:bg-white/5 text-slate-700 dark:text-gray-300 border-slate-200/80 dark:border-white/10 hover:border-primary/40 hover:bg-primary/5 hover:text-primary dark:hover:text-primary-light'
        ]"
        :data-label="lbl.name"
        @click="emit('set-active-label', lbl.name)"
      >
        {{ lbl.name }}
        <button
          v-if="canManageLocalLabels"
          class="focus:outline-none opacity-50 hover:opacity-100 transition-opacity"
          :class="
            activeLabel === lbl.name
              ? 'text-white'
              : 'text-slate-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400'
          "
          title="Delete Label"
          @click.stop="emit('delete-label', lbl.id)"
        >
          <CloseIcon class="w-3 h-3 ui-svg" />
        </button>
      </span>
      <span
        v-if="filteredLabels.length === 0"
        class="text-xs text-slate-400 italic block w-full text-center py-2"
        >No labels found</span
      >
    </div>

    <div v-if="canManageLocalLabels" class="flex gap-2">
      <input
        :value="newLabelName"
        type="text"
        placeholder="New label..."
        class="flex-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
        @input="onNewLabelInput"
        @keyup.enter="emit('add-label')"
      />
      <button
        class="bg-primary hover:bg-primary-light text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
        @click="emit('add-label')"
      >
        Add
      </button>
    </div>
  </div>
</template>
