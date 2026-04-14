<script setup lang="ts">
import SelectIcon from '@renderer/assets/icons/custom/touch_app.svg?component'
import SamIcon from '@renderer/assets/icons/custom/wand_shine.svg?component'
import ShapesIcon from '@renderer/assets/icons/custom/category.svg?component'
import ChevronDownIcon from '@renderer/assets/icons/custom/arrow_drop_down.svg?component'
import ArrowDropDownIcon from '@renderer/assets/icons/custom/arrow_drop_down.svg?component'
import PentagonIcon from '@renderer/assets/icons/custom/pentagon.svg?component'
import CropSquareIcon from '@renderer/assets/icons/custom/crop_square.svg?component'
import PolyLineIcon from '@renderer/assets/icons/custom/polyline.svg?component'
import KeypointIcon from '@renderer/assets/icons/custom/adjust.svg?component'
import CircleIcon from '@renderer/assets/icons/custom/circle.svg?component'
import UndoIcon from '@renderer/assets/icons/custom/undo.svg?component'
import RedoIcon from '@renderer/assets/icons/custom/redo.svg?component'
import DeleteIcon from '@renderer/assets/icons/custom/delete.svg?component'
import SamModelMenu from '@renderer/components/labeler/SamModelMenu.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'

/* eslint-disable no-undef */
const props = defineProps<{
  // SAM
  samStatus: SamStatusInfo
  samModels: Record<string, SamModelInfo>
  samDownloading: boolean
  samPaused: boolean
  samDownloadProgress: number
  samDownloadStage: 'idle' | 'encoder' | 'decoder' | 'done'
  samDownloadingModelId: string | null
  showSamSettings: boolean
  // Stroke
  strokeWidth: number
}>()

const emit = defineEmits<{
  (e: 'set-tool', tool: string): void
  (e: 'set-shape', shape: string): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'delete'): void
  (e: 'update:strokeWidth', val: number): void
  (e: 'update:showSamSettings', val: boolean): void
  (e: 'sam-model-select', id: string): void
  (e: 'sam-toggle-pause', id: string): void
  (e: 'sam-cancel-download', id: string): void
}>()

// Exposed refs so parent can still attach listeners via ref-based approach if needed
const undoBtn = ref<HTMLButtonElement | null>(null)
const redoBtn = ref<HTMLButtonElement | null>(null)
const deleteBtn = ref<HTMLButtonElement | null>(null)
const shapesToolBtn = ref<HTMLButtonElement | null>(null)
const shapesDropdown = ref<HTMLDivElement | null>(null)
const toolGroup = ref<HTMLDivElement | null>(null)

defineExpose({ undoBtn, redoBtn, deleteBtn, shapesToolBtn, shapesDropdown, toolGroup })

// Shapes dropdown open/close (local to toolbar)
let isShapesOpen = false
let onDocClick: ((e: MouseEvent) => void) | null = null
let onDocKeydown: ((e: KeyboardEvent) => void) | null = null

function openShapesDropdown(): void {
  if (!shapesDropdown.value) return
  shapesDropdown.value.classList.add('show')
  isShapesOpen = true
}

function closeShapesDropdown(): void {
  if (!shapesDropdown.value) return
  shapesDropdown.value.classList.remove('show')
  isShapesOpen = false
}

function toggleShapesDropdown(e?: Event): void {
  e?.preventDefault()
  e?.stopPropagation()
  isShapesOpen ? closeShapesDropdown() : openShapesDropdown()
}

function onShapesDropdownItemClick(e: MouseEvent): void {
  const t = (e.target as HTMLElement).closest('.annotation-tool') as HTMLElement | null
  if (t) {
    e.preventDefault()
    emit('set-shape', t.dataset.tool ?? '')
    closeShapesDropdown()
  }
  e.stopPropagation()
}

function onStrokeScroll(e: WheelEvent): void {
  const delta = Math.sign(e.deltaY) * -1
  const raw = props.strokeWidth + delta * 0.5
  emit('update:strokeWidth', Math.max(1, Math.min(10, raw)))
}

onMounted(() => {
  shapesToolBtn.value?.addEventListener('click', toggleShapesDropdown)
  shapesDropdown.value?.addEventListener('click', onShapesDropdownItemClick)

  onDocClick = (e: MouseEvent): void => {
    const t = e.target as Node
    if (
      shapesDropdown.value &&
      !shapesDropdown.value.contains(t) &&
      shapesToolBtn.value &&
      !shapesToolBtn.value.contains(t)
    ) {
      closeShapesDropdown()
    }
  }
  document.addEventListener('click', onDocClick)

  onDocKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeShapesDropdown()
  }
  document.addEventListener('keydown', onDocKeydown)
})

onBeforeUnmount(() => {
  shapesToolBtn.value?.removeEventListener('click', toggleShapesDropdown)
  shapesDropdown.value?.removeEventListener('click', onShapesDropdownItemClick)
  if (onDocClick) document.removeEventListener('click', onDocClick)
  if (onDocKeydown) document.removeEventListener('keydown', onDocKeydown)
})
</script>

<template>
  <div
    class="flex items-center justify-between p-1.5 bg-white/60 dark:bg-[#161920]/80 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-white/5 shadow-sm relative z-30"
  >
    <div id="tool-group" ref="toolGroup" class="flex items-center gap-0.5">
      <!-- Select tool -->
      <button
        class="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 annotation-tool transition-colors"
        data-tool="select"
        title="Select/Edit"
        @click="emit('set-tool', 'select')"
      >
        <SelectIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
      </button>

      <div class="h-5 w-px bg-slate-200 dark:bg-white/10 mx-1.5"></div>

      <!-- SAM split-button -->
      <div class="relative flex items-center sam-split-button group z-40">
        <button
          class="p-2.5 rounded-l-lg hover:bg-slate-100 dark:hover:bg-white/5 annotation-tool border-r border-slate-200/80 dark:border-white/5 flex items-center justify-center relative transition-colors"
          data-tool="sam"
          :title="`Shoot with labelGun (${samModels[samStatus.currentModelId]?.name || 'Fast'})`"
          @click="emit('set-tool', 'sam')"
        >
          <SamIcon
            class="ui-svg h-6 w-6 text-slate-600 dark:text-gray-300"
            :class="{ 'text-primary': samStatus.status === 'ready' }"
          />
          <div
            v-if="samStatus.status === 'loading'"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 rounded-l-lg"
          >
            <div
              class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"
            ></div>
          </div>
        </button>

        <!-- SAM dropdown chevron -->
        <button
          class="p-1 px-1.5 rounded-r-lg hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center border-l-0 transition-colors"
          title="Select Model"
          @click.stop="emit('update:showSamSettings', !showSamSettings)"
        >
          <ArrowDropDownIcon class="ui-svg h-5 w-5 text-slate-500 dark:text-gray-400" />
        </button>

        <!-- SAM model menu -->
        <SamModelMenu
          v-if="showSamSettings"
          :sam-status="samStatus"
          :sam-models="samModels"
          :sam-downloading="samDownloading"
          :sam-paused="samPaused"
          :sam-download-progress="samDownloadProgress"
          :sam-download-stage="samDownloadStage"
          :sam-downloading-model-id="samDownloadingModelId"
          @select="(id) => emit('sam-model-select', id)"
          @toggle-pause="(id) => emit('sam-toggle-pause', id)"
          @cancel-download="(id) => emit('sam-cancel-download', id)"
        />
      </div>

      <!-- Shapes dropdown -->
      <div class="relative ml-0.5 z-40">
        <button
          id="shapes-tool-btn"
          ref="shapesToolBtn"
          class="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-0.5 transition-colors"
          title="Annotation Shapes"
        >
          <ShapesIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
          <ChevronDownIcon class="ui-svg h-3 w-3 text-slate-500 dark:text-gray-400" />
        </button>

        <div
          id="shapes-dropdown"
          ref="shapesDropdown"
          class="absolute top-full mt-2 w-48 bg-slate-50 dark:bg-gray-800 rounded-lg shadow-xl z-50"
        >
          <a
            href="#"
            class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
            data-tool="bbox"
          >
            <CropSquareIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
            <span>Bounding Box</span>
          </a>
          <a
            href="#"
            class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
            data-tool="polygon"
          >
            <PentagonIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
            <span>Polygon</span>
          </a>
          <a
            href="#"
            class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
            data-tool="polyline"
          >
            <PolyLineIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
            <span>Polyline</span>
          </a>
          <a
            href="#"
            class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
            data-tool="keypoint"
          >
            <KeypointIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
            <span>Keypoint</span>
          </a>
          <a
            href="#"
            class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
            data-tool="circle"
          >
            <CircleIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
            <span>Circle</span>
          </a>
        </div>
      </div>

      <div class="h-5 w-px bg-slate-200 dark:bg-white/10 mx-1.5"></div>

      <!-- Undo -->
      <button
        ref="undoBtn"
        class="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
        title="Undo (Ctrl+Z)"
        @click="emit('undo')"
      >
        <UndoIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
      </button>

      <!-- Redo -->
      <button
        ref="redoBtn"
        class="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
        title="Redo (Ctrl+Y)"
        @click="emit('redo')"
      >
        <RedoIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
      </button>

      <!-- Delete -->
      <button
        ref="deleteBtn"
        class="p-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 transition-colors group/del"
        title="Delete (Del)"
        @click="emit('delete')"
      >
        <DeleteIcon
          class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300 group-hover/del:text-red-600 dark:group-hover/del:text-red-400"
        />
      </button>

      <div class="h-5 w-px bg-slate-200 dark:bg-white/10 mx-1.5"></div>

      <!-- Stroke width -->
      <div
        class="flex items-center gap-2 px-2"
        title="Border Thickness (Scroll to adjust)"
        @wheel.prevent="onStrokeScroll"
      >
        <span
          class="text-[11px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider"
          >Size</span
        >
        <input
          :value="strokeWidth"
          type="range"
          min="1"
          max="10"
          step="0.5"
          class="w-20 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer dark:bg-white/10 accent-primary outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          @input="emit('update:strokeWidth', parseFloat(($event.target as HTMLInputElement).value))"
        />
        <span class="text-xs font-mono text-slate-500 dark:text-gray-400 w-6 text-right">{{
          strokeWidth
        }}</span>
      </div>
    </div>
  </div>
</template>
