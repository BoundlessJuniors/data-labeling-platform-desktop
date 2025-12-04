import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Task } from '@renderer/types/annotation'
import { loadImage } from '@renderer/utils/image'

export function useTasks(initial: Task[]): {
  tasks: Ref<Task[]>
  currentTaskIndex: Ref<number>
  currentTask: ComputedRef<Task | undefined>
  loadTaskImage: (i: number, assign: (img: HTMLImageElement) => void) => Promise<void>
  goPrevTask: () => void
  goNextTask: () => void
} {
  const tasks = ref<Task[]>(initial)
  const currentTaskIndex = ref(0)
  const currentTask = computed(() => tasks.value[currentTaskIndex.value])

  const loadTaskImage = async (
    i: number,
    assign: (img: HTMLImageElement) => void
  ): Promise<void> => {
    const clamped = Math.max(0, Math.min(tasks.value.length - 1, i))
    currentTaskIndex.value = clamped
    const t = tasks.value[clamped]
    const img = await loadImage(t.image)
    assign(img)
  }

  const goPrevTask = (): void => {
    currentTaskIndex.value = (currentTaskIndex.value - 1 + tasks.value.length) % tasks.value.length
  }
  const goNextTask = (): void => {
    currentTaskIndex.value = (currentTaskIndex.value + 1) % tasks.value.length
  }

  return { tasks, currentTaskIndex, currentTask, loadTaskImage, goPrevTask, goNextTask }
}
