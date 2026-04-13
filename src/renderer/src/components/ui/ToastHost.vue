<script setup lang="ts">
import { useFeedback } from '@renderer/composables/useFeedback'

// Icons could be inline SVGs or Heroicons
// Using standard SVG code for success, warning, error, info
const { state, toast } = useFeedback()
</script>

<template>
  <!-- Toast Container: fixed at bottom right -->
  <div class="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2 pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="t in state.toasts"
        :key="t.id"
        class="toast-item pointer-events-auto flex items-start gap-3 p-4 rounded-lg bg-surface dark:bg-slate-800 border shadow-lg max-w-sm w-[350px]"
        :class="{
          'border-green-500/30 dark:border-green-500/20': t.variant === 'success',
          'border-red-500/30 dark:border-red-500/20': t.variant === 'error',
          'border-orange-500/30 dark:border-orange-500/20': t.variant === 'warning',
          'border-blue-500/30 dark:border-blue-500/20': t.variant === 'info'
        }"
      >
        <!-- Icon -->
        <div class="shrink-0 mt-0.5">
          <svg
            v-if="t.variant === 'success'"
            class="w-5 h-5 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <svg
            v-else-if="t.variant === 'error'"
            class="w-5 h-5 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <svg
            v-else-if="t.variant === 'warning'"
            class="w-5 h-5 text-orange-500"
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
            v-else
            class="w-5 h-5 text-blue-500"
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

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <h4
            class="text-sm font-semibold text-slate-800 dark:text-slate-100"
            :class="{ 'mb-1': t.message }"
          >
            {{ t.title }}
          </h4>
          <p v-if="t.message" class="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            {{ t.message }}
          </p>
        </div>

        <!-- Close Button -->
        <button
          class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          @click="toast.remove(t.id)"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Transition Group Classes */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100px) scale(0.9);
}
.toast-leave-active {
  position: relative; /* ensure space is collapsed smoothly if desired, but relative is safer for absolute repositioning */
  /* If absolute is used to make them slide up properly, add position: absolute; to leave-active */
}
</style>
