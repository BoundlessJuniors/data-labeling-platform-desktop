import { computed } from 'vue'
import type { LabelerState } from './useLabelerState'
import type { LabelDefinition, DatasetLabelSource } from '../types/annotation'

export function useDatasetLabeling(state: LabelerState): {
  loadDatasetLabeling: (datasetId: string) => Promise<void>
  addLocalLabel: (datasetId: string, name: string, color?: string) => Promise<void>
  deleteLocalLabel: (datasetId: string, labelId: string) => Promise<void>
  filteredLabels: import('vue').ComputedRef<LabelDefinition[]>
  isCloudLabelsReadOnly: import('vue').ComputedRef<boolean>
  canManageLocalLabels: import('vue').ComputedRef<boolean>
} {
  const loadDatasetLabeling = async (datasetId: string): Promise<void> => {
    try {
      const result = await window.api.db.datasets.getLabelingContext(datasetId)
      if (result) {
        state.labelSource = (result.dataset.labelSource ?? 'local') as DatasetLabelSource
        state.annotationFormat = result.dataset.annotationFormat ?? null
        state.labelingSpecJson = result.dataset.labelingSpecJson ?? null
        state.qcMode = result.dataset.qcMode ?? null
        state.labelSetName = result.dataset.labelSetName ?? null
        state.labelSetVersion = result.dataset.labelSetVersion ?? null
        state.availableLabels = result.labels as LabelDefinition[]
      } else {
        state.labelSource = 'local'
        state.availableLabels = []
        state.annotationFormat = null
        state.labelingSpecJson = null
        state.qcMode = null
        state.labelSetName = null
        state.labelSetVersion = null
      }

      // Automatically select the first label if none is active or active is invalid
      if (!state.activeLabel || !state.availableLabels.find((l) => l.name === state.activeLabel)) {
        state.activeLabel = state.availableLabels.length > 0 ? state.availableLabels[0].name : null
      }
    } catch (err) {
      console.error('Failed to load dataset labeling context:', err)
      state.labelingLoadError = err instanceof Error ? err.message : String(err)
      state.availableLabels = []
      state.activeLabel = null
      // We don't overwrite labelSource to 'local' strictly on a hard failure,
      // preventing a silent downgrade to local-empty for broken cloud lists.
    }
  }

  const addLocalLabel = async (datasetId: string, name: string, color?: string): Promise<void> => {
    if (state.labelSource === 'cloud') {
      throw new Error('Cannot add local label to a cloud dataset')
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Label name cannot be empty')
    }
    if (state.availableLabels.some((l) => l.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error(`Label with name "${trimmedName}" already exists`)
    }

    try {
      await window.api.db.datasetLabels.add({
        dataset_id: datasetId,
        name: trimmedName,
        color: color || null,
        source: 'local'
      })
      await loadDatasetLabeling(datasetId)

      if (!state.activeLabel) {
        state.activeLabel = name
      }
    } catch (err) {
      console.error('Failed to add local label:', err)
      throw err
    }
  }

  const deleteLocalLabel = async (datasetId: string, labelId: string): Promise<void> => {
    if (state.labelSource === 'cloud') {
      throw new Error('Cannot delete label from a cloud dataset')
    }

    try {
      const labelToDelete = state.availableLabels.find((l) => l.id === labelId)

      await window.api.db.datasetLabels.delete({ dataset_id: datasetId, label_id: labelId })
      await loadDatasetLabeling(datasetId)

      if (labelToDelete && state.activeLabel === labelToDelete.name) {
        state.activeLabel = state.availableLabels.length > 0 ? state.availableLabels[0].name : null
      }
    } catch (err) {
      console.error('Failed to delete label:', err)
      throw err
    }
  }

  const filteredLabels = computed(() => {
    if (!state.labelSearchTerm) return state.availableLabels
    const term = state.labelSearchTerm.toLowerCase()
    return state.availableLabels.filter((l) => l.name.toLowerCase().includes(term))
  })

  const isCloudLabelsReadOnly = computed(() => state.labelSource === 'cloud')
  const canManageLocalLabels = computed(() => state.labelSource === 'local')

  return {
    loadDatasetLabeling,
    addLocalLabel,
    deleteLocalLabel,
    filteredLabels,
    isCloudLabelsReadOnly,
    canManageLocalLabels
  }
}
