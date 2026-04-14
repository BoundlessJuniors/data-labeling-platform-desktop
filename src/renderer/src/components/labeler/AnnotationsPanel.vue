<script setup lang="ts">
// Pure UI component for the annotations panel
</script>

<template>
  <div
    class="bg-white/60 dark:bg-[#161920]/80 backdrop-blur-sm p-4 rounded-xl border border-slate-200/80 dark:border-white/5 shadow-sm flex flex-col min-h-0 flex-1"
  >
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-bold text-slate-800 dark:text-gray-200 tracking-wide uppercase">
        Annotations
      </h3>
    </div>
    <slot></slot>
  </div>
</template>
