<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LabelerView from './views/LabelerView.vue'
import CloudPanel from './components/CloudPanel.vue'

type DatasetRow = { id: string; name: string; created_at: number; folder_path?: string | null }

const activeTab = ref<'local' | 'cloud'>('local')
const datasets = ref<DatasetRow[]>([])

// Son seçilen dataset'i localStorage'dan geri yükle
const selectedDatasetId = ref<string | null>(localStorage.getItem('selectedDatasetId'))
const isDatasetModalOpen = ref<boolean>(false)

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
  const ok = confirm('Bu dataset silinsin mi? (Geri alınamaz)')
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
          v-if="isDatasetModalOpen && !selectedDatasetId"
          class="absolute inset-0 z-50 flex flex-col items-center p-6 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm transition-colors overflow-auto"
        >
          <!-- Sekme Butonları -->
          <div class="flex justify-center space-x-4 mb-8">
            <button
              class="px-6 py-2 rounded-md font-semibold transition-all duration-200"
              :class="
                activeTab === 'local'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              "
              @click="activeTab = 'local'"
            >
              Yerel Çalışma Alanı
            </button>
            <button
              class="px-6 py-2 rounded-md font-semibold transition-all duration-200"
              :class="
                activeTab === 'cloud'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              "
              @click="activeTab = 'cloud'"
            >
              Bulut Çalışma Alanı
            </button>
          </div>

          <!-- YEREL İÇERİK -->
          <div
            v-if="activeTab === 'local'"
            class="w-full max-w-xl rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-800 shadow-sm transition-colors relative"
          >
            <!-- Eğer iptal edebilmek istenirse çarpı konabilir ama dataset seçilmeden çıkılamıyor çünkü seçili yok -->
            <button
              v-if="selectedDatasetId"
              class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="isDatasetModalOpen = false"
            >
              ✕
            </button>

            <h1 class="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">
              Dataset Selection
            </h1>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select a dataset to continue or import a new folder.
            </p>

            <div class="flex gap-2 mb-4">
              <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="importDataset">
                Import Dataset
              </button>
            </div>

            <div v-if="datasets.length === 0" class="text-sm text-gray-500">No datasets found.</div>

            <ul v-else class="space-y-2">
              <li
                v-for="d in datasets"
                :key="d.id"
                class="flex items-center justify-between border dark:border-gray-700 rounded p-3 bg-gray-50 dark:bg-gray-700/50"
              >
                <div>
                  <div class="font-semibold text-gray-900 dark:text-gray-100">{{ d.name }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">id: {{ d.id }}</div>
                </div>
                <div class="flex gap-2">
                  <button
                    class="px-3 py-2 rounded bg-green-600 text-white"
                    @click="selectDataset(d.id)"
                  >
                    Select
                  </button>

                  <button
                    class="px-3 py-2 rounded bg-red-600 text-white"
                    @click="deleteDataset(d.id)"
                  >
                    Delete
                  </button>
                </div>
              </li>
            </ul>
          </div>

          <!-- BULUT İÇERİK -->
          <div v-else-if="activeTab === 'cloud'" class="w-full max-w-2xl px-2 relative">
            <button
              v-if="selectedDatasetId"
              class="absolute -top-12 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="isDatasetModalOpen = false"
            >
              ✕
            </button>
            <CloudPanel @dataset-downloaded="refreshDatasets" />
          </div>
        </div>

        <!-- Eğer daha önce bir dataset seçildiyse de sonradan datasets'e tıklanıp açılırsa -->
        <div
          v-else-if="isDatasetModalOpen && selectedDatasetId"
          class="absolute inset-0 z-50 flex flex-col items-center p-6 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm transition-colors overflow-auto"
        >
          <!-- Sekme Butonları -->
          <div class="flex justify-center space-x-4 mb-8">
            <button
              class="px-6 py-2 rounded-md font-semibold transition-all duration-200"
              :class="
                activeTab === 'local'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              "
              @click="activeTab = 'local'"
            >
              Yerel Çalışma Alanı
            </button>
            <button
              class="px-6 py-2 rounded-md font-semibold transition-all duration-200"
              :class="
                activeTab === 'cloud'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              "
              @click="activeTab = 'cloud'"
            >
              Bulut Çalışma Alanı
            </button>
          </div>

          <!-- YEREL İÇERİK -->
          <div
            v-if="activeTab === 'local'"
            class="w-full max-w-xl rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-800 shadow-sm transition-colors relative"
          >
            <!-- İptal Et -->
            <button
              class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="isDatasetModalOpen = false"
            >
              ✕
            </button>

            <h1 class="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">
              Dataset Selection
            </h1>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select a dataset to continue or import a new folder.
            </p>

            <div class="flex gap-2 mb-4">
              <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="importDataset">
                Import Dataset
              </button>
            </div>

            <div v-if="datasets.length === 0" class="text-sm text-gray-500">No datasets found.</div>

            <ul v-else class="space-y-2">
              <li
                v-for="d in datasets"
                :key="d.id"
                class="flex items-center justify-between border dark:border-gray-700 rounded p-3 bg-gray-50 dark:bg-gray-700/50"
              >
                <div>
                  <div class="font-semibold text-gray-900 dark:text-gray-100">{{ d.name }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">id: {{ d.id }}</div>
                </div>
                <div class="flex gap-2">
                  <button
                    class="px-3 py-2 rounded bg-green-600 text-white"
                    @click="selectDataset(d.id)"
                  >
                    Select
                  </button>

                  <button
                    class="px-3 py-2 rounded bg-red-600 text-white"
                    @click="deleteDataset(d.id)"
                  >
                    Delete
                  </button>
                </div>
              </li>
            </ul>
          </div>

          <!-- BULUT İÇERİK -->
          <div v-else-if="activeTab === 'cloud'" class="w-full max-w-2xl px-2 relative">
            <button
              class="absolute -top-12 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="isDatasetModalOpen = false"
            >
              ✕
            </button>
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
