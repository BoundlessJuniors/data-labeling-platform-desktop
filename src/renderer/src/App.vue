<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import LabelerView from './views/LabelerView.vue'
import ContractsPanel from './components/ContractsPanel.vue'
import ProfilePanel from './components/ProfilePanel.vue'
import ToastHost from './components/ui/ToastHost.vue'
import DialogHost from './components/ui/DialogHost.vue'

import { useAuth } from './composables/useAuth'
import { useCloud } from './composables/useCloud'
import { useFeedback } from './composables/useFeedback'

type DatasetRow = { id: string; name: string; created_at: number; folder_path?: string | null }

const activeTab = ref<'datasets' | 'contracts' | 'profile'>('datasets')
const datasets = ref<DatasetRow[]>([])

const { bootstrapSession, isAuthenticated } = useAuth()
const { fetchContracts } = useCloud()

const modalTitle = computed(() => {
  if (activeTab.value === 'contracts') return 'Contracts'
  if (activeTab.value === 'profile') return 'Profile'
  return 'Datasets'
})

const modalDescription = computed(() => {
  if (activeTab.value === 'contracts') {
    return 'Download assigned cloud work, monitor contract health, and submit completed tasks.'
  }
  if (activeTab.value === 'profile') {
    return 'Manage your LabelGun Cloud session and account access.'
  }
  return 'Import image folders and open an annotation workspace.'
})

// Date formatter
const formatDate = (ts: number | undefined): string => {
  if (!ts) return ''
  return new Intl.DateTimeFormat('default', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(ts))
}

// Son seçilen dataset'i localStorage'dan geri yükle
const selectedDatasetId = ref<string | null>(localStorage.getItem('selectedDatasetId'))
const isDatasetModalOpen = ref<boolean>(true)

async function refreshDatasets(): Promise<void> {
  datasets.value = await window.api.db.datasets.list()
}

async function selectDataset(id: string): Promise<void> {
  selectedDatasetId.value = id
  localStorage.setItem('selectedDatasetId', id)
  isDatasetModalOpen.value = false
}

async function importDataset(): Promise<void> {
  const res = await window.api.dataset.pickFolder()
  if (!res) return

  const folderNorm = res.folder.replace(/\\/g, '/')
  const existing = await window.api.db.datasets.getByFolder(folderNorm)
  // Eğer klasör daha önce eklendiyse yeni dataset oluşturma; aynı dataset'e yeni görselleri sync et
  const datasetId = existing?.id ?? `local-${Date.now()}`

  if (!existing) {
    await window.api.db.datasets.create({
      id: datasetId,
      name: `Local Dataset (${res.images.length})`,
      folder_path: folderNorm
    })
  }

  for (const imgName of res.images) {
    const fullPath = `${folderNorm}/${imgName}`
    await window.api.db.media.upsert({
      id: fullPath,
      dataset_id: datasetId,
      local_path: fullPath
    })
  }

  await refreshDatasets()
  await selectDataset(datasetId)
}

async function deleteDataset(id: string): Promise<void> {
  const { dialog } = useFeedback()
  const ok = await dialog.dangerConfirm({
    title: 'Delete Dataset',
    message: 'Bu dataset silinsin mi? (Geri alınamaz)'
  })
  if (!ok) return

  await window.api.db.datasets.delete(id)

  if (selectedDatasetId.value === id) {
    clearSelection()
  }
  await refreshDatasets()
}

function clearSelection(): void {
  selectedDatasetId.value = null
  localStorage.removeItem('selectedDatasetId')
}

onMounted(async () => {
  // Uygulama her açılışta dataset seçim ekranından başlasın
  localStorage.removeItem('selectedDatasetId')
  // Global auth restore
  await bootstrapSession()

  if (isAuthenticated.value) {
    await fetchContracts()
  }

  await refreshDatasets()
})

const onMinimize = (): void => {
  window.api?.window?.minimize()
}

const onToggleMaximize = (): void => {
  window.api?.window?.toggleMaximize()
}

const onClose = (): void => {
  window.api?.window?.close()
}
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Global Notifications & Dialogs -->
    <ToastHost />
    <DialogHost />

    <!-- Custom title bar (frameless window) -->
    <header
      class="flex items-center justify-between pl-4 pr-0 h-10 bg-slate-900 text-slate-100 dark:bg-slate-950 border-b border-slate-800/80 shadow-sm select-none"
      :class="'titlebar-drag'"
    >
      <div class="flex items-center h-full">
        <!-- Logo and App Name -->
        <div class="flex items-center gap-2 pr-6">
          <div
            class="h-5 w-5 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-[11px]"
          >
            LG
          </div>
          <span class="font-semibold tracking-wide text-[13px] text-slate-200">LabelGun</span>
        </div>

        <!-- Workspace Button -->
        <div class="h-full flex items-center no-drag">
          <button
            class="h-full px-5 flex items-center gap-2 transition-colors text-[13px] relative"
            :class="[
              isDatasetModalOpen
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            ]"
            @click="isDatasetModalOpen = true"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Workspace
            <!-- Aktif Sekme Alt Çizgisi -->
            <div
              v-show="isDatasetModalOpen"
              class="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-t"
            ></div>
          </button>
        </div>
      </div>

      <div class="flex items-center h-full no-drag">
        <button class="win-btn" @click="onMinimize">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M0 5H10" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </button>
        <button class="win-btn" @click="onToggleMaximize">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </button>
        <button class="win-btn win-btn-close" @click="onClose">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Main content: Always LabelerView underneath -->
    <main class="flex-1 min-h-0 relative">
      <!-- Workspace modal -->
      <transition name="fade">
        <div
          v-if="isDatasetModalOpen"
          class="absolute inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors overflow-auto"
        >
          <!-- ── MODAL HEADER ─────────────────────────────────────────── -->
          <div
            class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 sticky top-0 z-10 shadow-sm"
          >
            <div class="max-w-5xl w-full mx-auto px-6 py-5 flex items-center justify-between">
              <div class="flex flex-col gap-0.5">
                <div class="flex items-center gap-2">
                  <!-- Workspace Hub icon -->
                  <div
                    class="w-7 h-7 rounded-lg bg-blue-600/10 dark:bg-blue-500/15 flex items-center justify-center shrink-0"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="text-blue-600 dark:text-blue-400"
                    >
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                  </div>
                  <h1
                    class="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none"
                  >
                    {{ modalTitle }}
                  </h1>
                </div>
                <p class="text-sm text-slate-500 dark:text-slate-400 pl-9">
                  {{ modalDescription }}
                </p>
              </div>

              <!-- Close button — only when a dataset is selected -->
              <button
                v-if="selectedDatasetId"
                class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="Return to labeler"
                @click="isDatasetModalOpen = false"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- ── TAB NAVIGATION ─────────────────────────────────────── -->
            <div class="max-w-5xl w-full mx-auto px-6">
              <div class="flex gap-1">
                <!-- Datasets Tab -->
                <button
                  class="tab-btn"
                  :class="activeTab === 'datasets' ? 'tab-btn--active' : 'tab-btn--idle'"
                  @click="activeTab = 'datasets'"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    />
                  </svg>
                  Datasets
                </button>

                <!-- Contracts Tab -->
                <button
                  class="tab-btn"
                  :class="activeTab === 'contracts' ? 'tab-btn--active' : 'tab-btn--idle'"
                  @click="activeTab = 'contracts'"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Contracts
                </button>

                <!-- Profile Tab -->
                <button
                  class="tab-btn"
                  :class="activeTab === 'profile' ? 'tab-btn--active' : 'tab-btn--idle'"
                  @click="activeTab = 'profile'"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Profile
                </button>
              </div>
            </div>
          </div>

          <!-- ── TAB CONTENT ────────────────────────────────────────────── -->
          <div class="flex-1 px-6 py-8">
            <!-- DATASETS TAB -->
            <div v-if="activeTab === 'datasets'" class="max-w-5xl w-full mx-auto">
              <!-- Toolbar -->
              <div class="flex justify-between items-start mb-6">
                <div>
                  <h2 class="text-base font-semibold text-slate-800 dark:text-slate-200">
                    Local Datasets
                  </h2>
                  <p class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Image folders imported on this machine
                  </p>
                </div>
                <button
                  class="px-4 py-2 flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors text-sm"
                  @click="importDataset"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Import Dataset
                </button>
              </div>

              <!-- Empty State -->
              <div
                v-if="datasets.length === 0"
                class="flex flex-col items-center justify-center p-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-center"
              >
                <div
                  class="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-5 text-slate-400 dark:text-slate-500"
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    />
                  </svg>
                </div>
                <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  No datasets yet
                </h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
                  Import a folder of images to create your first local dataset and start labeling.
                </p>
                <button
                  class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors text-sm shadow-sm"
                  @click="importDataset"
                >
                  Browse Folders…
                </button>
              </div>

              <!-- Dataset List -->
              <div v-else class="space-y-3">
                <div
                  v-for="d in datasets"
                  :key="d.id"
                  class="group flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-sm hover:border-blue-300 dark:hover:border-blue-500/50 hover:shadow-md transition-all"
                >
                  <!-- Dataset info -->
                  <div class="flex items-center gap-4 flex-1 min-w-0 pr-4">
                    <div
                      class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500 dark:text-blue-400"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path
                          d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                        />
                      </svg>
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3
                          class="font-semibold text-slate-900 dark:text-slate-100 truncate text-sm"
                        >
                          {{ d.name }}
                        </h3>
                        <span
                          v-if="d.created_at"
                          class="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full shrink-0"
                        >
                          {{ formatDate(d.created_at) }}
                        </span>
                      </div>
                      <div
                        class="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="shrink-0"
                        >
                          <polyline points="9 11 12 14 22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        <span class="font-mono truncate" :title="d.folder_path || 'No path'">{{
                          d.folder_path || 'No path selected'
                        }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-colors"
                      @click="selectDataset(d.id)"
                    >
                      Open Workspace
                    </button>

                    <button
                      class="p-2 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Dataset"
                      @click="deleteDataset(d.id)"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path
                          d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                        />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- CONTRACTS TAB -->
            <div v-else-if="activeTab === 'contracts'" class="max-w-5xl w-full mx-auto">
              <ContractsPanel
                @dataset-downloaded="refreshDatasets"
                @open-profile="activeTab = 'profile'"
              />
            </div>

            <!-- PROFILE TAB -->
            <div v-else-if="activeTab === 'profile'" class="max-w-5xl w-full mx-auto">
              <ProfilePanel />
            </div>
          </div>
        </div>
      </transition>

      <div class="h-full overflow-hidden">
        <LabelerView
          :key="selectedDatasetId || 'empty'"
          :dataset-id="selectedDatasetId"
          :is-active="!!selectedDatasetId && !isDatasetModalOpen"
          @back-to-datasets="isDatasetModalOpen = true"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.titlebar-drag {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 48px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8; /* text-slate-400 */
  background: transparent;
  border: none;
  transition: all 0.15s ease-in-out;
  cursor: default;
}

.win-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

.win-btn:active {
  background-color: rgba(255, 255, 255, 0.15);
}

.win-btn-close:hover {
  background-color: #e81123;
  color: white;
}

.win-btn-close:active {
  background-color: #f1707a;
}

/* Tab buttons */
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s;
  border-bottom: 2px solid transparent;
  position: relative;
  bottom: -1px;
}

.tab-btn--active {
  color: #2563eb;
  border-bottom-color: #2563eb;
}

.tab-btn--idle {
  color: #94a3b8;
}

.tab-btn--idle:hover {
  color: #475569;
  background-color: rgba(148, 163, 184, 0.08);
  border-radius: 6px 6px 0 0;
}

:global(.dark) .tab-btn--active {
  color: #60a5fa;
  border-bottom-color: #60a5fa;
}

:global(.dark) .tab-btn--idle {
  color: #64748b;
}

:global(.dark) .tab-btn--idle:hover {
  color: #94a3b8;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
