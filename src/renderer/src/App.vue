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
  await refreshDatasets()
})
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Custom title bar (frameless window) -->
    <header
      class="flex items-center justify-between px-3 h-8 text-xs bg-slate-900 text-slate-100 select-none"
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
        <button
          class="w-9 h-8 flex items-center justify-center hover:bg-slate-800"
          @click="window.api.window.minimize()"
        >
          <span class="text-[10px] leading-none translate-y-[1px]">&#8212;</span>
        </button>
        <button
          class="w-9 h-8 flex items-center justify-center hover:bg-slate-800"
          @click="window.api.window.toggleMaximize()"
        >
          <span class="text-[9px] leading-none"></span>
        </button>
        <button
          class="w-9 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white"
          @click="window.api.window.close()"
        >
          <span class="text-[10px] leading-none">&#10005;</span>
        </button>
      </div>
    </header>

    <!-- Ana içerik -->
    <main class="flex-1 min-h-0">
      <!-- Dataset seçilmediyse seçim ekranı -->
      <div v-if="!selectedDatasetId" class="h-full flex items-center justify-center p-6 overflow-auto">
      <div class="w-full max-w-xl rounded-lg border border-gray-200 p-6 bg-white">
        <h1 class="text-2xl font-bold mb-2">Dataset Seçimi</h1>
        <p class="text-sm text-gray-600 mb-4">
          Devam etmek için bir dataset seçin veya yeni bir klasör import edin.
        </p>

        <div class="flex gap-2 mb-4">
          <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="importDataset">
            Import Dataset
          </button>
          <button class="px-4 py-2 rounded bg-gray-200" @click="refreshDatasets">Yenile</button>
        </div>

        <div v-if="datasets.length === 0" class="text-sm text-gray-500">Kayıtlı dataset yok.</div>

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
                Seç
              </button>

              <button class="px-3 py-2 rounded bg-red-600 text-white" @click="deleteDataset(d.id)">
                Sil
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
</style>
