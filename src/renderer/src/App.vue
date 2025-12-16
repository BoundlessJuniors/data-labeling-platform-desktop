<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LabelerView from './views/LabelerView.vue'

type DatasetRow = { id: string; name: string; created_at: number }

const datasets = ref<DatasetRow[]>([])
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

  const datasetId = `local-${Date.now()}`
  await window.api.db.datasets.create({
    id: datasetId,
    name: `Local Dataset (${res.images.length})`
  })

  for (const imgName of res.images) {
    const fullPath = `${res.folder.replace(/\\/g, '/')}/${imgName}`
    await window.api.db.media.upsert({
      id: imgName,
      dataset_id: datasetId,
      local_path: fullPath
    })
  }

  await refreshDatasets()
  await selectDataset(datasetId)
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
  <div class="h-screen">
    <!-- Dataset seçilmediyse seçim ekranı -->
    <div v-if="!selectedDatasetId" class="h-full flex items-center justify-center p-6">
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
            <button class="px-3 py-2 rounded bg-green-600 text-white" @click="selectDataset(d.id)">
              Seç
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Dataset seçildiyse Labeler -->
    <div v-else class="h-full">
      <LabelerView :dataset-id="selectedDatasetId" @back-to-datasets="clearSelection" />
    </div>
  </div>
</template>
