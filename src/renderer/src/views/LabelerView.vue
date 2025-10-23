<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue'

type Task = {
  id: number
  name: string
  type: 'Image Labeling' | 'Audio Labeling' | 'Text Labeling'
  done: boolean
}

const tasks = reactive<Task[]>([
  { id: 1, name: 'Task 1', type: 'Image Labeling', done: true },
  { id: 2, name: 'Task 2', type: 'Image Labeling', done: true },
  { id: 3, name: 'Task 3', type: 'Audio Labeling', done: true },
  { id: 4, name: 'Task 4', type: 'Text Labeling', done: false },
  { id: 5, name: 'Task 5', type: 'Image Labeling', done: false },
  { id: 6, name: 'Task 6', type: 'Text Labeling', done: false }
])

const currentTaskIndex = ref(0)
const taskTitle = ref('Image Annotation - Task 1')

function setActiveTask(i: number) {
  currentTaskIndex.value = i
  taskTitle.value = `Image Annotation - ${tasks[i].name}`
}
function nextTask() {
  if (currentTaskIndex.value < tasks.length - 1) setActiveTask(currentTaskIndex.value + 1)
}
function prevTask() {
  if (currentTaskIndex.value > 0) setActiveTask(currentTaskIndex.value - 1)
}

const isDark = ref(false)
function toggleTheme() {
  isDark.value = !isDark.value
  const root = document.documentElement
  root.classList.toggle('dark', isDark.value)
  root.classList.toggle('light', !isDark.value)
}

/** Canvas refs & state */
const canvasContainer = ref<HTMLDivElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const coordsText = ref('X: 0, Y: 0')
const crossH = ref<HTMLDivElement | null>(null)
const crossV = ref<HTMLDivElement | null>(null)

const state = reactive({
  scale: 1,
  isPanning: false,
  startX: 0,
  startY: 0,
  translateX: 0,
  translateY: 0,
  img: new Image(),
  svg: new Image()
})

let ctx: CanvasRenderingContext2D | null = null

function drawCanvas() {
  if (!ctx || !canvasEl.value) return
  const c = canvasEl.value
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.save()
  ctx.translate(state.translateX, state.translateY)
  ctx.scale(state.scale, state.scale)
  ctx.drawImage(state.img, 0, 0)
  ctx.globalAlpha = 0.5
  ctx.drawImage(state.svg, 0, 0)
  ctx.globalAlpha = 1
  ctx.restore()
}

function updateTransform() {
  if (!canvasEl.value) return
  canvasEl.value.style.transform = `translate(-50%, -50%) translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`
  drawCanvas()
}

function fitToScreen() {
  const container = canvasContainer.value
  const c = canvasEl.value
  if (!container || !c) return

  const containerW = container.clientWidth
  const containerH = container.clientHeight
  const imgW = state.img.naturalWidth || 1280
  const imgH = state.img.naturalHeight || 720

  c.width = imgW
  c.height = imgH

  const scaleX = containerW / imgW
  const scaleY = containerH / imgH
  state.scale = Math.min(scaleX, scaleY)
  state.translateX = 0
  state.translateY = 0

  c.style.width = `${imgW * state.scale}px`
  c.style.height = `${imgH * state.scale}px`
  updateTransform()
}

function zoom(delta: number, clientX?: number, clientY?: number) {
  const c = canvasEl.value
  if (!c) return
  const rect = c.getBoundingClientRect()
  const mouseX = clientX ? clientX - rect.left : rect.width / 2
  const mouseY = clientY ? clientY - rect.top : rect.height / 2

  const worldX = (mouseX - (rect.width / 2 + state.translateX)) / state.scale
  const worldY = (mouseY - (rect.height / 2 + state.translateY)) / state.scale

  const newScale = Math.max(0.1, Math.min(state.scale + delta * state.scale, 10))
  state.translateX = mouseX - rect.width / 2 - worldX * newScale
  state.translateY = mouseY - rect.height / 2 - worldY * newScale
  state.scale = newScale

  if (c) {
    c.style.width = `${c.width * state.scale}px`
    c.style.height = `${c.height * state.scale}px`
  }
  updateTransform()
}

function resetView() {
  fitToScreen()
}

/** Events */
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  zoom(delta, e.clientX, e.clientY)
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  state.isPanning = true
  state.startX = e.clientX - state.translateX
  state.startY = e.clientY - state.translateY
  if (canvasContainer.value) canvasContainer.value.style.cursor = 'grabbing'
}

function onMouseUp() {
  state.isPanning = false
  if (canvasContainer.value) canvasContainer.value.style.cursor = 'grab'
}

function onMouseLeave() {
  onMouseUp()
}

function onMouseMove(e: MouseEvent) {
  const c = canvasEl.value
  const container = canvasContainer.value
  if (!c || !container) return

  const rect = c.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const containerRect = container.getBoundingClientRect()
  const crossX = e.clientX - containerRect.left
  const crossY = e.clientY - containerRect.top
  if (crossH.value) crossH.value.style.top = `${crossY}px`
  if (crossV.value) crossV.value.style.left = `${crossX}px`

  const imgX = x / state.scale - state.translateX / state.scale + c.width / 2
  const imgY = y / state.scale - state.translateY / state.scale + c.height / 2
  coordsText.value = `X: ${Math.round(imgX)}, Y: ${Math.round(imgY)}`

  if (state.isPanning) {
    state.translateX = e.clientX - state.startX
    state.translateY = e.clientY - state.startY
    updateTransform()
  }
}

function keyNav(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextTask()
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevTask()
  }
}

onMounted(() => {
  // tema
  document.documentElement.classList.add('light')

  // canvas & ctx
  ctx = canvasEl.value?.getContext('2d') ?? null

  // arka plan resmi
  state.img.src =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDoDZlkwd2fe6baaerK6-NnJ2m2Cmp8ybU4-q-NnY_xvFG_XXDzXL3imRKjdxhdRKQA2yy9ikkvUxP2kCvQWZWfXXKPsnP2hUPOBpbtJs6gCN3pkJ310CVasZ7nfKeK7EpxiAjufAUKKgt0tVSDWflQjPO_pDcYUjIR8CzRyGTw9RfC5MTPdl6ggC5igc9ESHmZDp6rhqibG6-DoV4nJQT_SiepYOmQtOl8-IdZAUZkrXu0F5Zp7CfTkaC1Tq4I-kmcWbcNS4VRF_0'

  // örnek anotasyon SVG’si
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
      <path d="M 300 200 L 350 180 L 400 220 L 420 300 L 380 350 L 300 320 Z"
            fill="rgba(17,115,212,0.4)" stroke="#1173d4" stroke-width="2"/>
      <rect x="550" y="400" width="150" height="100"
            fill="rgba(17,115,212,0.4)" stroke="#1173d4" stroke-width="2"/>
    </svg>`
  state.svg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)

  const onReady = () => fitToScreen()
  if (state.img.complete) onReady()
  else state.img.onload = onReady
  if (state.svg.complete) onReady()
  else state.svg.onload = onReady

  // events
  canvasContainer.value?.addEventListener('wheel', onWheel, { passive: false })
  canvasContainer.value?.addEventListener('mousedown', onMouseDown)
  canvasContainer.value?.addEventListener('mouseup', onMouseUp)
  canvasContainer.value?.addEventListener('mouseleave', onMouseLeave)
  canvasContainer.value?.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', fitToScreen)
  document.addEventListener('keydown', keyNav)

  setActiveTask(0)
})

onBeforeUnmount(() => {
  canvasContainer.value?.removeEventListener('wheel', onWheel as any)
  canvasContainer.value?.removeEventListener('mousedown', onMouseDown as any)
  canvasContainer.value?.removeEventListener('mouseup', onMouseUp as any)
  canvasContainer.value?.removeEventListener('mouseleave', onMouseLeave as any)
  canvasContainer.value?.removeEventListener('mousemove', onMouseMove as any)
  window.removeEventListener('resize', fitToScreen as any)
  document.removeEventListener('keydown', keyNav as any)
})
</script>

<template>
  <div
    class="flex h-screen bg-background-light dark:bg-background-dark font-display text-gray-800 dark:text-gray-200"
  >
    <!-- Sidebar -->
    <aside
      class="flex flex-col w-64 bg-white dark:bg-background-dark border-r border-gray-200 dark:border-gray-800"
    >
      <div class="p-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">LabelGun</h1>
      </div>
      <nav class="flex-1 px-4 space-y-2">
        <h2
          class="px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
        >
          Tasks
        </h2>
        <ul class="space-y-1">
          <li v-for="(t, i) in tasks" :key="t.id" class="relative group">
            <a
              href="#"
              @click.prevent="setActiveTask(i)"
              class="flex items-center justify-between px-2 py-2 text-sm font-medium rounded"
              :class="
                i === currentTaskIndex
                  ? 'bg-primary/10 text-primary dark:bg-primary/20'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              "
            >
              <span>{{ t.name }}</span>
              <span
                class="material-symbols-outlined"
                :class="t.done ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
              >
                {{ t.done ? 'check_circle' : 'radio_button_unchecked' }}
              </span>
            </a>
            <div
              class="hidden group-hover:block absolute left-full top-0 ml-2 w-max px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium rounded-md shadow-lg z-10"
            >
              {{ t.type }}
            </div>
          </li>
        </ul>
      </nav>
      <div class="p-4 border-t border-gray-200 dark:border-gray-800">
        <button
          class="w-full flex items-center justify-center gap-2 rounded bg-primary/10 dark:bg-primary/20 py-2 px-4 text-sm font-semibold text-primary hover:bg-primary/20 dark:hover:bg-primary/30"
        >
          <span class="material-symbols-outlined">filter_list</span>
          <span>Filter Tasks</span>
        </button>
      </div>
    </aside>

    <!-- Main -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <header
        class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-background-dark"
      >
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ taskTitle }}</h2>
          <div class="flex items-center gap-2">
            <button
              class="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              :disabled="currentTaskIndex === 0"
              @click="prevTask"
              title="Previous Task (←)"
            >
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <button
              class="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              :disabled="currentTaskIndex === tasks.length - 1"
              @click="nextTask"
              title="Next Task (→)"
            >
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <button
            id="theme-toggle"
            @click="toggleTheme"
            class="relative inline-flex items-center h-8 w-14 rounded-full bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            <span class="sr-only">Toggle theme</span>
            <span
              class="absolute left-1.5 top-1.5 h-5 w-5 bg-white dark:bg-gray-800 rounded-full shadow-md transform transition-transform duration-300 ease-in-out"
              :class="isDark ? 'translate-x-6' : ''"
            >
              <span
                class="material-symbols-outlined text-sm text-gray-600"
                :class="isDark ? 'opacity-0' : 'opacity-100'"
                >light_mode</span
              >
              <span
                class="material-symbols-outlined text-sm text-yellow-400 absolute"
                :class="isDark ? 'opacity-100' : 'opacity-0'"
                >dark_mode</span
              >
            </span>
          </button>

          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span class="material-symbols-outlined">timer</span>
            <div class="flex items-center gap-1 font-mono">
              <div
                class="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-lg font-bold text-gray-900 dark:text-white"
              >
                01
              </div>
              <span>:</span>
              <div
                class="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-lg font-bold text-gray-900 dark:text-white"
              >
                23
              </div>
              <span>:</span>
              <div
                class="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-lg font-bold text-gray-900 dark:text-white"
              >
                45
              </div>
            </div>
          </div>

          <button
            class="flex items-center justify-center gap-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <span class="material-symbols-outlined text-green-500">cloud_done</span>
            <span>Save Draft</span>
          </button>
          <button
            class="flex items-center justify-center gap-2 rounded bg-primary py-2 px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            <span>Submit Work</span>
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </header>

      <div class="flex-1 flex p-2 gap-2 overflow-y-auto">
        <div class="flex-1 flex flex-col gap-2">
          <!-- Toolbar (şimdilik pasif ikonlar) -->
          <div
            class="flex items-center justify-between gap-1 p-2 bg-white dark:bg-background-dark rounded-lg border border-gray-200 dark:border-gray-800"
          >
            <div class="flex items-center gap-1">
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Select/Edit"
              >
                <span class="material-symbols-outlined">touch_app</span>
              </button>
              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
              <button class="p-2 rounded-lg bg-primary/10 text-primary" title="SAM">
                <span class="material-symbols-outlined">auto_fix</span>
              </button>
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Bounding Box"
              >
                <span class="material-symbols-outlined">crop_square</span>
              </button>
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Polygon"
              >
                <span class="material-symbols-outlined">pentagon</span>
              </button>
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Polyline"
              >
                <span class="material-symbols-outlined">timeline</span>
              </button>
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Keypoint"
              >
                <span class="material-symbols-outlined">radio_button_checked</span>
              </button>
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Circle"
              >
                <span class="material-symbols-outlined">radio_button_unchecked</span>
              </button>
              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
              <button class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Undo">
                <span class="material-symbols-outlined">undo</span>
              </button>
              <button class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Redo">
                <span class="material-symbols-outlined">redo</span>
              </button>
              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Visibility"
              >
                <span class="material-symbols-outlined">visibility</span>
              </button>
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Layer Order"
              >
                <span class="material-symbols-outlined">layers</span>
              </button>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Pan"
              >
                <span class="material-symbols-outlined">pan_tool</span>
              </button>
            </div>
          </div>

          <!-- Canvas alanı -->
          <div
            ref="canvasContainer"
            class="relative w-full flex-1 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden canvas-container"
          >
            <canvas ref="canvasEl" class="object-contain"></canvas>

            <div class="crosshair-lines">
              <div ref="crossH" class="crosshair-line crosshair-horizontal"></div>
              <div ref="crossV" class="crosshair-line crosshair-vertical"></div>
            </div>

            <div
              class="absolute bottom-4 right-4 flex items-center gap-1 bg-black/50 p-1 rounded-lg text-white"
            >
              <button class="p-2 rounded-md hover:bg-white/20" @click="zoom(-0.1)">
                <span class="material-symbols-outlined">zoom_out</span>
              </button>
              <button class="p-2 rounded-md hover:bg-white/20" @click="zoom(0.1)">
                <span class="material-symbols-outlined">zoom_in</span>
              </button>
              <button class="p-2 rounded-md hover:bg-white/20" @click="fitToScreen()">
                <span class="material-symbols-outlined">fit_screen</span>
              </button>
              <button class="p-2 rounded-md hover:bg-white/20" @click="resetView()">
                <span class="material-symbols-outlined">restart_alt</span>
              </button>
            </div>

            <div
              class="absolute bottom-4 left-4 bg-black/50 text-white text-xs font-mono rounded px-2 py-1"
            >
              {{ coordsText }}
            </div>
          </div>
        </div>

        <!-- Right panels -->
        <div class="w-full lg:w-96 flex flex-col gap-4">
          <div
            class="bg-white dark:bg-background-dark p-4 rounded-lg border border-gray-200 dark:border-gray-800"
          >
            <h3 class="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Annotations</h3>
            <div class="space-y-3">
              <div class="p-3 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/30">
                <div class="flex justify-between items-center">
                  <p class="text-sm font-medium text-primary">Car 1</p>
                  <div class="flex items-center gap-1">
                    <button class="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                      <span class="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button class="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                      <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">SAM Polygon</p>
              </div>

              <div
                class="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div class="flex justify-between items-center">
                  <p class="text-sm font-medium text-gray-800 dark:text-gray-200">Person 1</p>
                  <div class="flex items-center gap-1">
                    <button class="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                      <span class="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button class="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                      <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Bounding Box</p>
              </div>
            </div>
            <div class="mt-4 flex justify-end gap-2">
              <button
                class="rounded bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Add New
              </button>
            </div>
          </div>

          <div
            class="bg-white dark:bg-background-dark p-4 rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col flex-1"
          >
            <h3 class="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Labels</h3>
            <div class="relative mb-3">
              <span
                class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                >search</span
              >
              <input
                type="search"
                placeholder="Search labels..."
                class="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-primary focus:border-primary"
              />
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                class="cursor-pointer bg-primary text-white text-xs font-medium px-2.5 py-1 rounded-full border border-primary"
                >Car</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20"
                >Pedestrian</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20"
                >Traffic Light</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20"
                >Bicycle</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20"
                >Bus</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20"
                >Motorcycle</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20"
                >Truck</span
              >
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
