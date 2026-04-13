<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LabelerView from './views/LabelerView.vue'
import CloudPanel from './components/CloudPanel.vue'
import ToastHost from './components/ui/ToastHost.vue'
import DialogHost from './components/ui/DialogHost.vue'

import { useFeedback } from './composables/useFeedback'

type DatasetRow = { id: string; name: string; created_at: number; folder_path?: string | null }

const activeTab = ref<'local' | 'cloud'>('local')
const datasets = ref<DatasetRow[]>([])

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
        <!-- Logo and App Name (Sürüklenebilir alanın bir parçası) -->
        <div class="flex items-center gap-2 pr-6">
          <div
            class="h-5 w-5 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-[11px]"
          >
            LG
          </div>
          <span class="font-semibold tracking-wide text-[13px] text-slate-200">LabelGun</span>
        </div>

        <!-- Datasets Tab (Sekme Görünümü) -->
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
            Datasets
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

    <!-- Main content: Always LabelerView -->
    <main class="flex-1 min-h-0 relative">
      <!-- Dataset seçimi modülü -->
      <transition name="fade">
        <div
          v-if="isDatasetModalOpen"
          class="absolute inset-0 z-50 flex flex-col p-6 sm:p-10 bg-slate-50 dark:bg-slate-900 transition-colors overflow-auto"
        >
          <!-- Üst Alan: Başlık ve Kapat Butonu -->
          <div class="max-w-5xl w-full mx-auto flex items-start justify-between mb-8">
            <div>
              <h1 class="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Datasets
              </h1>
              <p class="text-slate-500 dark:text-slate-400 mt-1">
                Manage your local datasets or sync with LabelGun Cloud.
              </p>
            </div>
            <button
              v-if="selectedDatasetId"
              class="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="Close Workspace"
              @click="isDatasetModalOpen = false"
            >
              <svg
                width="24"
                height="24"
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

          <!-- Sekme Navigasyonu -->
          <div class="max-w-5xl w-full mx-auto mb-6">
            <div class="flex border-b border-slate-200 dark:border-slate-800">
              <button
                class="px-6 py-3 font-medium text-sm transition-colors border-b-2 relative -bottom-[1px]"
                :class="
                  activeTab === 'local'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                "
                @click="activeTab = 'local'"
              >
                Local Workspace
              </button>
              <button
                class="px-6 py-3 font-medium text-sm transition-colors border-b-2 relative -bottom-[1px]"
                :class="
                  activeTab === 'cloud'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                "
                @click="activeTab = 'cloud'"
              >
                Cloud Workspace
              </button>
            </div>
          </div>

          <!-- YEREL İÇERİK -->
          <div v-if="activeTab === 'local'" class="max-w-5xl w-full mx-auto">
            <!-- Toolbar -->
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Local Datasets
              </h2>
              <button
                class="px-4 py-2 flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors text-sm"
                @click="importDataset"
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Import Dataset
              </button>
            </div>

            <!-- Boş Durum -->
            <div
              v-if="datasets.length === 0"
              class="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-center"
            >
              <div class="p-4 bg-slate-100 dark:bg-slate-700 rounded-full mb-4 text-slate-400">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  ></path>
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                No local datasets found
              </h3>
              <p class="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm">
                Get started by importing a folder containing your images. We'll automatically set up
                a workspace for you.
              </p>
              <button
                class="px-4 py-2 rounded-md bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium transition-colors text-sm shadow-sm"
                @click="importDataset"
              >
                Browse Folders...
              </button>
            </div>

            <!-- Dataset Listesi -->
            <div v-else class="space-y-3">
              <div
                v-for="d in datasets"
                :key="d.id"
                class="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800 shadow-sm hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
              >
                <div class="flex-1 min-w-0 pr-4">
                  <div class="flex items-center gap-3 mb-1">
                    <h3 class="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {{ d.name }}
                    </h3>
                    <span
                      v-if="d.created_at"
                      class="text-xs text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full"
                    >
                      {{ formatDate(d.created_at) }}
                    </span>
                  </div>
                  <div
                    class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 truncate"
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
                      class="shrink-0"
                    >
                      <path
                        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                      ></path>
                    </svg>
                    <span class="truncate" :title="d.folder_path || 'No path'">{{
                      d.folder_path || 'No path selected'
                    }}</span>
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <button
                    class="px-4 py-2 rounded-md bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors text-sm font-medium shadow-sm"
                    @click="selectDataset(d.id)"
                  >
                    Open Workspace
                  </button>

                  <button
                    class="p-2 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Delete Dataset"
                    @click="deleteDataset(d.id)"
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
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path
                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      ></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- BULUT İÇERİK -->
          <div v-else-if="activeTab === 'cloud'" class="max-w-5xl w-full mx-auto">
            <CloudPanel @dataset-downloaded="refreshDatasets" />
          </div>
        </div>
      </transition>

      <div class="h-full overflow-hidden">
        <LabelerView
          :key="selectedDatasetId || 'empty'"
          :dataset-id="selectedDatasetId"
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
  background-color: #e81123; /* Windows native red */
  color: white;
}

.win-btn-close:active {
  background-color: #f1707a;
}
</style>
