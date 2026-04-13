<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useFeedback } from '@renderer/composables/useFeedback'

const { state, dialog } = useFeedback()

const handleKeydown = (e: KeyboardEvent): void => {
  if (!state.dialog.isOpen) return

  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    dialog.close(false)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    dialog.close(true)
  }
}

watch(
  () => state.dialog.isOpen,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown, true) // capture phase to override other listeners
    } else {
      window.removeEventListener('keydown', handleKeydown, true)
    }
  }
)

onMounted(() => {
  if (state.dialog.isOpen) {
    window.addEventListener('keydown', handleKeydown, true)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <Transition name="fade">
    <div
      v-if="state.dialog.isOpen"
      class="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      @click.self="dialog.close(false)"
    >
      <div
        class="bg-surface dark:bg-slate-900 w-full max-w-md p-6 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4 transform transition-all"
      >
        <div class="flex items-start gap-4">
          <!-- Optional Icon -->
          <div v-if="state.dialog.options.icon !== false" class="shrink-0 mt-0.5">
            <svg
              v-if="state.dialog.options.variant === 'dangerConfirm'"
              class="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <svg
              v-else-if="state.dialog.options.variant === 'confirm'"
              class="w-6 h-6 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <svg
              v-else-if="state.dialog.options.variant === 'error'"
              class="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <svg
              v-else-if="state.dialog.options.variant === 'warning'"
              class="w-6 h-6 text-orange-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <svg
              v-else-if="state.dialog.options.variant === 'success'"
              class="w-6 h-6 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <svg
              v-else
              class="w-6 h-6 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <div class="flex-1">
            <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              {{ state.dialog.options.title }}
            </h3>
            <p class="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              {{ state.dialog.options.message }}
            </p>
            <p
              v-if="state.dialog.options.detail"
              class="mt-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2 rounded"
            >
              {{ state.dialog.options.detail }}
            </p>
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-3">
          <button
            v-if="state.dialog.options.secondaryAction"
            class="px-4 py-2 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            @click="dialog.close(false)"
          >
            {{ state.dialog.options.secondaryAction }}
          </button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-md text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            :class="{
              'bg-red-600 hover:bg-red-700 focus:ring-red-500':
                state.dialog.options.variant === 'dangerConfirm' ||
                state.dialog.options.variant === 'error',
              'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500':
                state.dialog.options.variant !== 'dangerConfirm' &&
                state.dialog.options.variant !== 'error'
            }"
            @click="dialog.close(true)"
          >
            {{ state.dialog.options.primaryAction || 'OK' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
