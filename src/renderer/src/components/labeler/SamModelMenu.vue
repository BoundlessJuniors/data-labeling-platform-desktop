<script setup lang="ts">
import PauseIcon from '@renderer/assets/icons/custom/pause.svg?component'
import PlayIcon from '@renderer/assets/icons/custom/play_arrow.svg?component'
import CloseIcon from '@renderer/assets/icons/custom/close.svg?component'

defineProps<{
  // eslint-disable-next-line no-undef
  samStatus: SamStatusInfo
  // eslint-disable-next-line no-undef
  samModels: Record<string, SamModelInfo>
  samDownloading: boolean
  samPaused: boolean
  samDownloadProgress: number
  samDownloadStage: 'idle' | 'encoder' | 'decoder' | 'done'
  samDownloadingModelId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'toggle-pause', id: string): void
  (e: 'cancel-download', id: string): void
}>()
</script>

<template>
  <div
    class="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-gray-900 rounded-lg shadow-xl z-50 border border-slate-200 dark:border-gray-700 overflow-hidden"
  >
    <div
      class="bg-slate-50 dark:bg-gray-800 px-3 py-2 border-b border-slate-200 dark:border-gray-700"
    >
      <div class="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
        Active Model
      </div>
    </div>

    <div class="p-1">
      <div
        v-for="(model, id) in samModels"
        :key="id"
        class="relative group/item flex flex-col gap-1 p-3 rounded-md cursor-pointer transition-all border border-transparent"
        :class="{
          'bg-primary/5 border-primary/20': samStatus.currentModelId === id,
          'hover:bg-slate-50 dark:hover:bg-gray-800': samStatus.currentModelId !== id
        }"
        @click="emit('select', String(id))"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <!-- Status dot -->
            <div
              class="w-2 h-2 rounded-full"
              :class="{
                'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]':
                  samStatus.currentModelId === id && samStatus.status === 'ready',
                'bg-slate-300 dark:bg-gray-600': samStatus.currentModelId !== id
              }"
            ></div>
            <span
              class="text-sm font-semibold"
              :class="
                samStatus.currentModelId === id
                  ? 'text-primary'
                  : 'text-slate-700 dark:text-gray-200'
              "
              >{{ model.name }}</span
            >
          </div>
          <span
            class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors"
            :class="
              samStatus.modelsStatus[id] === 'available'
                ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
                : 'text-slate-400 bg-slate-100 dark:bg-gray-800'
            "
          >
            {{ samStatus.modelsStatus[id] === 'available' ? 'Downloaded' : model.size }}
          </span>
        </div>

        <p class="text-[11px] text-slate-500 dark:text-gray-400 pl-4 leading-snug">
          {{ model.description }}
        </p>

        <!-- Download progress area -->
        <div
          v-if="(samDownloading || samPaused) && samDownloadingModelId === id"
          class="mt-2 pl-4"
          @click.stop
        >
          <div class="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>{{
              samPaused
                ? 'Paused'
                : samDownloadStage === 'encoder'
                  ? 'Downloading Encoder...'
                  : 'Downloading Decoder...'
            }}</span>
            <span>{{ Math.floor(samDownloadProgress * 100) }}%</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-primary transition-all duration-300 ease-out"
                :style="{ width: `${Math.max(5, samDownloadProgress * 100)}%` }"
              ></div>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="p-0.5 hover:bg-slate-200 dark:hover:bg-gray-600 rounded"
                @click.stop="emit('toggle-pause', String(id))"
              >
                <component
                  :is="samPaused ? PlayIcon : PauseIcon"
                  class="w-4 h-4 text-slate-600 dark:text-gray-300"
                />
              </button>
              <button
                class="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded group/cancel"
                @click.stop="emit('cancel-download', String(id))"
              >
                <CloseIcon class="w-4 h-4 text-slate-400 group-hover/cancel:text-red-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
