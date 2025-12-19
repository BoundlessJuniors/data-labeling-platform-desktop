<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LabelerView from './views/LabelerView.vue'

type DatasetRow = { id: string; name: string; created_at: number; folder_path?: string | null }

const datasets = ref<DatasetRow[]>([])

// Son seçilen dataset'i localStorage'dan geri yükle
const selectedDatasetId = ref<string | null>(localStorage.getItem('selectedDatasetId'))

async function refreshDatasets(): Promise<void> {
  datasets.value = await window.api.db.datasets.list()
}

async function selectDataset(id: string): Promise<void> {
  selectedDatasetId.value = id
  localStorage.setItem('selectedDatasetId', id)
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
      class="flex items-center justify-between px-3 h-8 text-xs bg-slate-900 text-slate-100 dark:bg-slate-950 border-b border-slate-800 shadow-sm select-none"
      :class="'titlebar-drag'"
    >
      <div class="flex items-center gap-2 no-drag">
        <div
          class="h-5 w-5 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]"
        >
          LG
        </div>
        <span class="font-semibold tracking-tight">LabelGun</span>

        <button
          class="ml-3 px-2 py-1 rounded hover:bg-slate-800 text-[11px] border border-slate-700/70"
          @click="clearSelection"
        >
          Datasets
        </button>
      </div>

      <div class="flex items-center gap-1 no-drag">
        <button class="win-btn" @click="onMinimize">
          <span class="text-[10px] leading-none translate-y-[1px]">&#8212;</span>
        </button>
        <button class="win-btn win-btn-max" @click="onToggleMaximize">
          <span class="sr-only">Maximize</span>
        </button>
        <button class="win-btn win-btn-close" @click="onClose">
          <span class="text-[10px] leading-none">&#10005;</span>
        </button>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 min-h-0">
      <!-- Dataset selection screen -->
      <div
        v-if="!selectedDatasetId"
        class="h-full flex items-center justify-center p-6 overflow-auto"
      >
        <div class="w-full max-w-xl rounded-lg border border-gray-200 p-6 bg-white">
          <h1 class="text-2xl font-bold mb-2">Dataset Selection</h1>
          <p class="text-sm text-gray-600 mb-4">
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
              class="flex items-center justify-between border rounded p-3"
            >
              <div>
                <div class="font-semibold">{{ d.name }}</div>
                <div class="text-xs text-gray-500">id: {{ d.id }}</div>
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
      </div>

      <!-- Dataset seçildiyse Labeler -->
      <div v-else class="h-full overflow-hidden">
        <LabelerView :dataset-id="selectedDatasetId" @back-to-datasets="clearSelection" />
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
  width: 2.25rem; /* w-9 */
  height: 2rem; /* h-8 */
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e5e7eb; /* text-slate-200 */
  background: transparent;
  border: none;
}

.win-btn:hover {
  background-color: #0f172a; /* slate-900-ish */
}

.win-btn-max {
  position: relative;
}

.win-btn-max::before {
  content: '';
  position: absolute;
  box-sizing: border-box;
  border: 1px solid rgba(226, 232, 240, 0.9);
  width: 10px;
  height: 10px;
  border-radius: 1px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.win-btn-close:hover {
  background-color: #dc2626; /* red-600 */
  color: #ffffff;
}
</style>
