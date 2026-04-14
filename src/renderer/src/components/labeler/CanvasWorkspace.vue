<script setup lang="ts">
import { ref } from 'vue'
import KonvaCanvas from '@renderer/components/KonvaCanvas.vue'
import SamIcon from '@renderer/assets/icons/custom/wand_shine.svg?component'
import ZoomOutIcon from '@renderer/assets/icons/custom/zoom_out.svg?component'
import ZoomInIcon from '@renderer/assets/icons/custom/zoom_in.svg?component'
import FitScreenIcon from '@renderer/assets/icons/custom/fit_screen.svg?component'
import ResetViewIcon from '@renderer/assets/icons/custom/restart_alt.svg?component'
import type { Annotation } from '@renderer/types/annotation'

const props = defineProps<{
  imageSrc: string | null
  annotations: Annotation[]
  activeTool: 'select' | 'sam' | 'shapes'
  activeShape: 'bbox' | 'polygon' | 'polyline' | 'keypoint' | 'circle'
  activeLabel: string | null
  selectedId: number | null
  editingId: number | null
  strokeWidth: number
  showEditHint: boolean
  autoSaveOverlayVisible?: boolean
}>()

const emit = defineEmits<{
  (e: 'create-annotation', ann: Annotation): void
  (e: 'select-annotation', id: number | null): void
  (
    e: 'pointer-move',
    payload: { screenX: number; screenY: number; imgX: number | null; imgY: number | null }
  ): void
  (e: 'pointer-leave'): void
  (e: 'sam-click', payload: { imgX: number; imgY: number }): void
  (e: 'sam-draw', payload: { points: { x: number; y: number }[]; labels: number[] }): void
  (e: 'edit-request', id: number): void
  (e: 'update-annotation-state', payload: { id: number; patch: Record<string, unknown> }): void
  (e: 'annotation-transform-end'): void
  (e: 'dismiss-edit-hint'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'fit-screen'): void
  (e: 'reset-view'): void
}>()

// Internal refs for overlay elements used by parent (coords, crosshairs)
const canvasContainer = ref<HTMLDivElement | null>(null)
const crosshairH = ref<HTMLDivElement | null>(null)
const crosshairV = ref<HTMLDivElement | null>(null)
const coords = ref<HTMLDivElement | null>(null)
const autoSaveOverlay = ref<HTMLDivElement | null>(null)

const konvaCanvasRef = ref<InstanceType<typeof KonvaCanvas> | null>(null)

// Expose canvas control methods to parent (for keyboard shortcuts etc.)
function zoomBy(delta: number): void {
  konvaCanvasRef.value?.zoomBy(delta)
}

function fitToContainer(): void {
  konvaCanvasRef.value?.fitToContainer()
}

function cancelCurrentShape(): void {
  konvaCanvasRef.value?.cancelCurrentShape?.()
}

function finishCurrentShape(): void {
  konvaCanvasRef.value?.finishCurrentShape?.()
}

function hasActiveDrawing(): boolean {
  return konvaCanvasRef.value?.hasActiveDrawing?.() ?? false
}

// Pointer overlay updates (called by parent via template event forwarding or directly)
function updatePointerOverlay(payload: {
  screenX: number
  screenY: number
  imgX: number | null
  imgY: number | null
}): void {
  if (canvasContainer.value) canvasContainer.value.classList.add('has-pointer')
  if (crosshairH.value) crosshairH.value.style.top = `${payload.screenY}px`
  if (crosshairV.value) crosshairV.value.style.left = `${payload.screenX}px`
  if (coords.value) {
    if (payload.imgX != null && payload.imgY != null) {
      coords.value.textContent = `X: ${Math.round(payload.imgX)}, Y: ${Math.round(payload.imgY)}`
    } else {
      coords.value.textContent = 'X: -, Y: -'
    }
  }
}

function clearPointerOverlay(): void {
  if (canvasContainer.value) canvasContainer.value.classList.remove('has-pointer')
  if (coords.value) coords.value.textContent = 'X: -, Y: -'
}

// Expose overlay refs and canvas ref for parent access
defineExpose({
  zoomBy,
  fitToContainer,
  cancelCurrentShape,
  finishCurrentShape,
  hasActiveDrawing,
  updatePointerOverlay,
  clearPointerOverlay,
  autoSaveOverlay,
  canvasContainer,
  konvaCanvasRef
})

function onPointerMove(payload: {
  screenX: number
  screenY: number
  imgX: number | null
  imgY: number | null
}): void {
  updatePointerOverlay(payload)
  emit('pointer-move', payload)
}

function onPointerLeave(): void {
  clearPointerOverlay()
  emit('pointer-leave')
}
</script>

<template>
  <div
    class="flex-1 rounded-xl bg-white/60 dark:bg-[#161920]/80 backdrop-blur-sm border border-slate-200/80 dark:border-white/5 shadow-sm p-2 flex flex-col min-h-0"
  >
    <div
      ref="canvasContainer"
      class="relative w-full h-full rounded-lg bg-slate-50 dark:bg-[#0f1115] overflow-hidden canvas-container shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border border-slate-200/50 dark:border-white/5"
    >
      <!-- Konva canvas -->
      <KonvaCanvas
        ref="konvaCanvasRef"
        :image-src="props.imageSrc"
        :annotations="props.annotations"
        :active-tool="props.activeTool"
        :active-shape="props.activeShape"
        :active-label="props.activeLabel"
        :selected-id="props.selectedId"
        :editing-id="props.editingId"
        :stroke-width="props.strokeWidth"
        @create-annotation="(ann) => emit('create-annotation', ann)"
        @select-annotation="(id) => emit('select-annotation', id)"
        @pointer-move="onPointerMove"
        @pointer-leave="onPointerLeave"
        @sam-click="(p) => emit('sam-click', p)"
        @sam-draw="(p) => emit('sam-draw', p)"
        @edit-request="(id) => emit('edit-request', id)"
        @update-annotation-state="(p) => emit('update-annotation-state', p)"
        @annotation-transform-end="() => emit('annotation-transform-end')"
      />

      <!-- Edit hint toast -->
      <transition name="fade">
        <div
          v-if="showEditHint"
          class="absolute top-4 right-4 bg-black/80 text-white text-xs sm:text-sm px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 max-w-xs"
        >
          <SamIcon class="ui-svg h-4 w-4 text-primary-light" />
          <span>Tip: Long-press on a polygon to adjust its shape.</span>
          <button
            type="button"
            class="ml-1 text-[10px] sm:text-xs underline underline-offset-2 decoration-white/60 hover:decoration-white focus:outline-none"
            @click.stop="emit('dismiss-edit-hint')"
          >
            Don't show again
          </button>
        </div>
      </transition>

      <!-- Crosshair overlay -->
      <div class="crosshair-lines">
        <div ref="crosshairH" class="crosshair-line crosshair-horizontal"></div>
        <div ref="crosshairV" class="crosshair-line crosshair-vertical"></div>
      </div>

      <!-- Coordinate display -->
      <div
        ref="coords"
        class="absolute bottom-4 left-4 bg-black/40 dark:bg-black/60 shadow-lg backdrop-blur-md text-white/90 text-[11px] font-mono rounded-lg px-3 py-1.5 border border-white/10 tracking-widest"
      >
        X: -, Y: -
      </div>

      <!-- Zoom controls -->
      <div
        class="absolute bottom-4 right-4 flex items-center gap-0.5 bg-black/40 dark:bg-black/60 shadow-lg backdrop-blur-md p-1.5 rounded-xl border border-white/10 text-white"
      >
        <button
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          title="Zoom Out"
          @click="emit('zoom-out')"
        >
          <ZoomOutIcon class="ui-svg h-5 w-5 text-white" />
        </button>
        <button
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          title="Zoom In"
          @click="emit('zoom-in')"
        >
          <ZoomInIcon class="ui-svg h-5 w-5 text-white" />
        </button>
        <button
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          title="Fit to Screen"
          @click="emit('fit-screen')"
        >
          <FitScreenIcon class="ui-svg h-5 w-5 text-white" />
        </button>
        <button
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          title="Restart"
          @click="emit('reset-view')"
        >
          <ResetViewIcon class="ui-svg h-5 w-5 text-white" />
        </button>
      </div>

      <!-- Auto-save overlay -->
      <div ref="autoSaveOverlay" class="auto-save-overlay">
        <div class="auto-save-pill">
          <div class="auto-save-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <span class="auto-save-text">Auto saved</span>
        </div>
      </div>
    </div>
  </div>
</template>
