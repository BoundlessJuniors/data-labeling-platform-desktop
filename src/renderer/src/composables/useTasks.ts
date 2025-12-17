import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Task } from '@renderer/types/annotation'
import { loadImage } from '@renderer/utils/image'

function toLocalUrlMaybe(p: string): string {
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('local://')) return p

  const isWinAbs = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\')
  const isPosixAbs = p.startsWith('/')

  if (isWinAbs) {
    const normalized = p.replace(/\\/g, '/')
    return `local:///${encodeURI(normalized)}`
  }

  if (isPosixAbs) {
    return `local:///${encodeURI(p.replace(/^\/+/, ''))}`
  }

  return p
}

export function useTasks(initial: Task[]): {
  tasks: Ref<Task[]>
  currentTaskIndex: Ref<number>
  currentTask: ComputedRef<Task | undefined>
  initFromDb: (datasetId: string) => Promise<void>
  loadTaskImage: (i: number, assign: (img: HTMLImageElement) => void) => Promise<void>
  goPrevTask: () => void
  goNextTask: () => void
} {
  const tasks = ref<Task[]>(initial)
  const currentTaskIndex = ref(0)
  const currentTask = computed(() => tasks.value[currentTaskIndex.value])

  const initFromDb = async (datasetId: string): Promise<void> => {
    const rows = await window.api.db.media.listByDataset(datasetId)
    tasks.value = rows.map((r, idx) => ({
      id: idx + 1,
      title: `Task ${idx + 1}`,
      mediaId: r.id, // asıl DB kimliği
      image: r.local_path,
      status: r.status === 'completed' ? 'completed' : 'in_progress',
      timeSeconds: typeof r.annotation_seconds === 'number' ? r.annotation_seconds : 0
    }))
    currentTaskIndex.value = 0
  }

  const loadTaskImage = async (
    i: number,
    assign: (img: HTMLImageElement) => void
  ): Promise<void> => {
    const clamped = Math.max(0, Math.min(tasks.value.length - 1, i))
    currentTaskIndex.value = clamped
    const t = tasks.value[clamped]
    const img = await loadImage(toLocalUrlMaybe(t.image))
    assign(img)
  }

  const goPrevTask = (): void => {
    currentTaskIndex.value = (currentTaskIndex.value - 1 + tasks.value.length) % tasks.value.length
  }
  const goNextTask = (): void => {
    currentTaskIndex.value = (currentTaskIndex.value + 1) % tasks.value.length
  }

  return { tasks, currentTaskIndex, currentTask, initFromDb, loadTaskImage, goPrevTask, goNextTask }
}
