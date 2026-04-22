<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import {
  useCloud,
  type SubmitResult,
  type CloudContract,
  type ContractHealth
} from '../composables/useCloud'

const emit = defineEmits<{
  (e: 'dataset-downloaded'): void
}>()

const {
  user,
  isAuthenticated,
  isLoading: authLoading,
  error: authError,
  login,
  logout,
  bootstrapSession
} = useAuth()
const {
  contracts,
  isFetching: cloudFetching,
  syncError,
  downloadResult,
  fetchContracts,
  downloadContractWork,
  syncNow,
  submitContract,
  getContractHealth,
  recoverExpiredTasks,
  resetContractLocalState
} = useCloud()

// Form durumları
const email = ref('')
const password = ref('')
const processingContractId = ref<string | null>(null)
const downloadAmount = ref(20)
const isSyncing = ref(false)
const submitResult = ref<SubmitResult | null>(null)

// Health durumu
const contractHealthMap = ref<Record<string, ContractHealth>>({})

const loadHealthForAll = async (): Promise<void> => {
  const nextMap: Record<string, ContractHealth> = {}
  for (const c of contracts.value || []) {
    if (c.status === 'active' || c.status === 'revision_requested') {
      try {
        nextMap[c.id] = await getContractHealth(c.id, c._count?.tasks)
      } catch (err) {
        console.error('Failed to load health for', c.id, err)
      }
    }
  }
  contractHealthMap.value = nextMap
}

// --------------------------------------------------------------------------------
// Giriş İşlemi
// --------------------------------------------------------------------------------
const handleLogin = async (): Promise<void> => {
  if (!email.value || !password.value) return
  try {
    await login(email.value, password.value)
    if (isAuthenticated.value) {
      await fetchContracts()
      await loadHealthForAll()
    }
  } catch (err) {
    console.error('Login failed', err)
  }
}

// --------------------------------------------------------------------------------
// İndirme İşlemi (Lease-batch + Download)
// --------------------------------------------------------------------------------
const handleDownload = async (
  contractId: string,
  contractTitle: string,
  expectedTaskCount?: number
): Promise<void> => {
  processingContractId.value = contractId
  submitResult.value = null
  try {
    const amount = Math.min(Math.max(1, downloadAmount.value), 100)
    await downloadContractWork(contractId, contractTitle, amount, expectedTaskCount)
    await loadHealthForAll()
    if (downloadResult.value?.status === 'downloaded') {
      emit('dataset-downloaded')
    }
  } catch (err) {
    console.error('Download failed', err)
  } finally {
    processingContractId.value = null
  }
}

// --------------------------------------------------------------------------------
// Manuel Sync
// --------------------------------------------------------------------------------
const handleSync = async (): Promise<void> => {
  isSyncing.value = true
  submitResult.value = null
  try {
    await syncNow()
    await loadHealthForAll()
  } catch (err) {
    console.error('Sync failed', err)
  } finally {
    isSyncing.value = false
  }
}

// --------------------------------------------------------------------------------
// Sözleşme Teslim Et
// --------------------------------------------------------------------------------
const handleSubmitContract = async (contract: CloudContract): Promise<void> => {
  if (isSyncing.value) {
    alert('A sync operation is currently in progress. Please wait for it to finish.')
    return
  }

  const health = contractHealthMap.value[contract.id]
  if (health && health.pendingInsertCount > 0) {
    alert(
      'You have pending local changes that have not been synced to the cloud. Please click "Sync Now" first.'
    )
    return
  }

  if (health && health.conflictCount > 0) {
    alert(
      'Some tasks are already submitted on the backend but your local annotations differ. Resolve the conflict or reset local state before submitting.'
    )
    return
  }

  processingContractId.value = contract.id
  submitResult.value = null
  try {
    const expectedTaskCount = contract._count?.tasks
    const result = await submitContract(contract.id, expectedTaskCount)
    submitResult.value = result
    if (result.ok) {
      await fetchContracts()
    }
    await loadHealthForAll()
  } catch (err) {
    console.error('Contract submit failed', err)
  } finally {
    processingContractId.value = null
  }
}

// --------------------------------------------------------------------------------
// Expired Lease Kurtarma İşlemi
// --------------------------------------------------------------------------------
const handleRecover = async (contractId: string): Promise<void> => {
  processingContractId.value = contractId
  submitResult.value = null
  try {
    const result = await recoverExpiredTasks(contractId)
    console.log(`Recovered ${result.recoveredCount} expired tasks.`)
    await loadHealthForAll()
  } catch (err) {
    console.error('Recovery failed', err)
  } finally {
    processingContractId.value = null
  }
}

// --------------------------------------------------------------------------------
// Reset Local Contract State
// --------------------------------------------------------------------------------
const handleReset = async (contractId: string): Promise<void> => {
  if (
    !window.confirm(
      'This will remove all local files, annotations, leases, and cached state for this contract. Cloud data will not be deleted. Continue?'
    )
  ) {
    return
  }

  processingContractId.value = contractId
  submitResult.value = null
  if (downloadResult.value) downloadResult.value = null
  syncError.value = null

  try {
    await resetContractLocalState(contractId)
    await fetchContracts()
    await loadHealthForAll()
  } catch (err) {
    console.error('Reset failed', err)
    syncError.value = err instanceof Error ? err.message : 'Sıfırlama başarısız oldu.'
  } finally {
    processingContractId.value = null
  }
}

// --------------------------------------------------------------------------------
// Component Mount
// --------------------------------------------------------------------------------
onMounted(async (): Promise<void> => {
  if (!isAuthenticated.value) {
    await bootstrapSession()
  }
  if (isAuthenticated.value) {
    await fetchContracts()
    await loadHealthForAll()
  }
})
</script>

<template>
  <div class="cloud-panel w-full transition-colors">
    <!-- DURUM 1: GİRİŞ YAPILMAMIŞ -->
    <div
      v-if="!isAuthenticated"
      class="max-w-4xl mx-auto flex flex-col md:flex-row bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      <!-- Yan Panel (Branding / Bilgi) -->
      <div
        class="md:w-1/2 p-8 lg:p-12 bg-slate-50 dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 flex flex-col justify-center"
      >
        <div
          class="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6"
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
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Connect to Cloud</h2>
        <p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6">
          Sign in to your LabelGun Cloud account to sync assigned labeling contracts, download
          datasets efficiently, and submit your completed tasks directly.
        </p>
        <ul class="space-y-3 text-sm text-slate-500 dark:text-slate-500">
          <li class="flex items-center gap-2">
            <svg
              class="text-slate-400"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Secure, token-based authentication
          </li>
          <li class="flex items-center gap-2">
            <svg
              class="text-slate-400"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Seamless dataset downloading
          </li>
          <li class="flex items-center gap-2">
            <svg
              class="text-slate-400"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Submit your approved work easily
          </li>
        </ul>
      </div>

      <!-- Giriş Formu -->
      <div class="md:w-1/2 p-8 lg:p-12 flex flex-col justify-center">
        <h2 class="text-xl font-bold mb-6 text-slate-900 dark:text-slate-100">Sign In</h2>
        <form class="space-y-5" @submit.prevent="handleLogin">
          <div>
            <label
              class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 focus-within:text-blue-600"
              >Email Address</label
            >
            <input
              v-model="email"
              class="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              type="email"
              required
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label
              class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 focus-within:text-blue-600"
              >Password</label
            >
            <input
              v-model="password"
              class="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              type="password"
              required
              placeholder="••••••••"
            />
          </div>

          <div
            v-if="authError"
            class="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm mt-3 bg-red-50 dark:bg-red-500/10 p-3 rounded-md border border-red-200 dark:border-red-500/20 w-fit"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="mt-0.5 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {{ authError }}
          </div>

          <button
            class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm disabled:opacity-50 transition-colors mt-2"
            type="submit"
            :disabled="authLoading"
          >
            {{ authLoading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>
      </div>
    </div>

    <!-- DURUM 2: GİRİŞ YAPILMIŞ -->
    <div v-else class="cloud-workspace">
      <!-- Toolbar -->
      <div
        class="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center font-bold text-slate-600 dark:text-slate-300"
          >
            {{ user?.email ? user.email.charAt(0).toUpperCase() : 'U' }}
          </div>
          <div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Signed in as</div>
            <div class="font-medium text-slate-900 dark:text-slate-100">{{ user?.email }}</div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md font-medium transition-colors text-sm shadow-sm disabled:opacity-50"
            :disabled="isSyncing"
            @click="handleSync"
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
              :class="isSyncing ? 'animate-spin' : ''"
            >
              <path
                d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9"
              />
            </svg>
            {{ isSyncing ? 'Syncing...' : 'Sync Now' }}
          </button>
          <button
            class="px-4 py-2 flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-medium transition-colors text-sm"
            @click="logout"
          >
            Sign Out
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div
        v-if="cloudFetching && !processingContractId"
        class="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400"
      >
        <svg
          class="animate-spin mb-4"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p>Loading contracts...</p>
      </div>

      <!-- Alerts -->
      <div
        v-if="syncError"
        class="border-l-4 border-red-500 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 p-4 rounded-r-md mb-6 shadow-sm"
      >
        <div class="flex">
          <div class="shrink-0">
            <svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium">{{ syncError }}</p>
          </div>
        </div>
      </div>

      <div
        v-if="downloadResult && downloadResult.status === 'downloaded'"
        class="border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 p-4 rounded-r-md mb-6 shadow-sm"
      >
        <div class="flex">
          <div class="shrink-0">
            <svg class="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium">
              Download Complete for
              {{
                contracts?.find((c) => c.id === downloadResult?.contractId)?.listing?.title ||
                'Contract'
              }}: {{ downloadResult.leased }} leased, {{ downloadResult.downloaded }} downloaded,
              {{ downloadResult.skipped }} skipped, {{ downloadResult.failed }} failed.
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="downloadResult && downloadResult.status === 'zero_leased'"
        class="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 p-4 rounded-r-md mb-6 shadow-sm"
      >
        <div class="flex">
          <div class="shrink-0">
            <svg class="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium">
              No tasks were leased for
              {{
                contracts?.find((c) => c.id === downloadResult?.contractId)?.listing?.title ||
                'Contract'
              }}. They might be already leased by others or currently unavailable.
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="downloadResult && downloadResult.status === 'already_fully_downloaded'"
        class="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 p-4 rounded-r-md mb-6 shadow-sm"
      >
        <div class="flex">
          <div class="shrink-0">
            <svg class="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium">
              You have already downloaded all available tasks for
              {{
                contracts?.find((c) => c.id === downloadResult?.contractId)?.listing?.title ||
                'this contract'
              }}
              locally.
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="downloadResult && downloadResult.status === 'stale_local_state'"
        class="border-l-4 border-red-500 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-400 p-4 rounded-r-md mb-6 shadow-sm"
      >
        <div class="flex">
          <div class="shrink-0">
            <svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium">
              Stale or conflicting local state detected for
              {{
                contracts?.find((c) => c.id === downloadResult?.contractId)?.listing?.title ||
                'Contract'
              }}. Please reset the local contract state before downloading.
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="submitResult && !submitResult.ok"
        class="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 p-4 rounded-r-md mb-6 shadow-sm"
      >
        <div class="flex">
          <div class="shrink-0">
            <svg class="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium">Submit failed: {{ submitResult.error }}</p>
            <ul
              v-if="
                submitResult.notDownloadedCount ||
                submitResult.inProgressCount ||
                submitResult.pendingInsertCount ||
                submitResult.failedCount ||
                submitResult.leaseExpiredCount
              "
              class="mt-2 list-disc list-inside text-sm opacity-90 space-y-1"
            >
              <li v-if="submitResult.notDownloadedCount">
                {{ submitResult.notDownloadedCount }} missing task(s) not downloaded
              </li>
              <li v-if="submitResult.inProgressCount">
                {{ submitResult.inProgressCount }} unfinished local task(s)
              </li>
              <li v-if="submitResult.pendingInsertCount">
                {{ submitResult.pendingInsertCount }} pending upload/sync
              </li>
              <li v-if="submitResult.failedCount">
                {{ submitResult.failedCount }} permanent fails
              </li>
              <li v-if="submitResult.leaseExpiredCount">
                {{ submitResult.leaseExpiredCount }} lease expired
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div
        v-if="submitResult && submitResult.ok"
        class="border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 p-4 rounded-r-md mb-6 shadow-sm"
      >
        <div class="flex">
          <div class="shrink-0">
            <svg class="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium">Contract successfully submitted.</p>
          </div>
        </div>
      </div>

      <!-- Contract List -->
      <div v-if="(contracts || []).length > 0" class="space-y-3">
        <div
          v-for="contract in contracts || []"
          :key="contract.id"
          class="flex flex-col md:flex-row md:items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors gap-4"
        >
          <!-- Top row (header + actions) -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-1">
                <h3 class="font-semibold text-lg text-slate-900 dark:text-slate-100 truncate">
                  {{ contract.listing?.title || 'Untitled Contract' }}
                </h3>
                <span
                  class="px-2.5 py-0.5 rounded-full text-xs font-medium border"
                  :class="
                    contract.status === 'active'
                      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20'
                      : contract.status === 'revision_requested'
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                        : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                  "
                >
                  {{ contract.status.replace('_', ' ').toUpperCase() }}
                </span>
              </div>
              <div class="text-sm text-slate-500 dark:text-slate-400 font-mono truncate">
                ID: {{ contract.id }}
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-3 shrink-0 flex-wrap">
              <div
                class="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-1.5 rounded-md border border-slate-200 dark:border-slate-700"
              >
                <span
                  class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1"
                  >Limit:</span
                >
                <input
                  v-model.number="downloadAmount"
                  type="number"
                  min="1"
                  max="100"
                  class="w-14 px-2 py-1 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                />
                <button
                  class="px-4 py-1.5 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white rounded font-medium disabled:opacity-50 transition-colors shadow-sm text-sm"
                  :disabled="cloudFetching || processingContractId === contract.id"
                  @click="
                    handleDownload(
                      contract.id,
                      contract.listing?.title || 'Cloud_Dataset',
                      contract._count?.tasks
                    )
                  "
                >
                  <span v-if="processingContractId === contract.id && !isSyncing">...</span>
                  <span v-else>Download</span>
                </button>
              </div>

              <button
                v-if="contract.status === 'active' || contract.status === 'revision_requested'"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50 transition-colors shadow-sm text-sm"
                :disabled="
                  cloudFetching ||
                  processingContractId === contract.id ||
                  isSyncing ||
                  (contractHealthMap[contract.id]?.pendingInsertCount ?? 0) > 0 ||
                  (contractHealthMap[contract.id]?.conflictCount ?? 0) > 0
                "
                @click="handleSubmitContract(contract)"
              >
                <span v-if="processingContractId === contract.id">Submitting...</span>
                <span v-else>Submit Work</span>
              </button>
            </div>
          </div>

          <!-- Health Row -->
          <div
            v-if="contractHealthMap[contract.id]"
            class="mt-2 pt-4 border-t border-slate-100 dark:border-slate-700/50 flex flex-col gap-2.5"
          >
            <div
              class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between"
            >
              <span>Contract Health & Recovery</span>
              <span class="text-xs font-normal text-slate-500"
                >{{ contractHealthMap[contract.id].localDownloadedCount }} /
                {{ contractHealthMap[contract.id].expectedTaskCount }} Tasks Downloaded</span
              >
            </div>

            <div
              v-if="contractHealthMap[contract.id].missingLocalExportCount > 0"
              class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2 bg-red-50 dark:bg-red-500/10 p-2.5 rounded-md border border-red-100 dark:border-red-500/20"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span
                >Missing annotations on
                {{ contractHealthMap[contract.id].missingLocalExportCount }} completed task(s). Open
                tasks in labeler and re-save.</span
              >
            </div>

            <div
              v-if="contractHealthMap[contract.id].inProgressCount > 0"
              class="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 p-2.5 rounded-md border border-amber-100 dark:border-amber-500/20"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span
                >{{ contractHealthMap[contract.id].inProgressCount }} local task(s) are unfinished.
                Complete them before submission.</span
              >
            </div>

            <div
              v-if="contractHealthMap[contract.id].pendingInsertCount > 0"
              class="text-sm text-blue-600 dark:text-blue-400 flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-500/10 p-2.5 rounded-md border border-blue-100 dark:border-blue-500/20"
            >
              <div class="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <path
                    d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9"
                  />
                </svg>
                <span
                  >{{ contractHealthMap[contract.id].pendingInsertCount }} task(s) waiting to be
                  synced to the cloud.</span
                >
              </div>
              <button
                class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded font-medium disabled:opacity-50 transition-colors"
                :disabled="isSyncing"
                @click="handleSync"
              >
                Sync Now
              </button>
            </div>

            <div
              v-if="contractHealthMap[contract.id].conflictCount > 0"
              class="text-sm text-red-700 dark:text-red-400 flex items-center justify-between gap-2 bg-red-100 dark:bg-red-900/30 p-2.5 rounded-md border border-red-200 dark:border-red-700/50"
            >
              <div class="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <path
                    d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span
                  >Çakışma: {{ contractHealthMap[contract.id].conflictCount }} görev backend'de
                  çoktan teslim edilmiş (submitted) ancak lokal verileriniz farklı. Çözüm için
                  sıfırlama (Reset) gereklidir.</span
                >
              </div>
            </div>

            <div
              v-if="contractHealthMap[contract.id].leaseExpiredCount > 0"
              class="text-sm text-amber-700 dark:text-amber-500 flex items-center justify-between gap-2 bg-amber-100 dark:bg-amber-900/30 p-2.5 rounded-md border border-amber-200 dark:border-amber-700/50"
            >
              <div class="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <path
                    d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span
                  >{{ contractHealthMap[contract.id].leaseExpiredCount }} task(s) have expired
                  leases. Recovery is required before re-downloading.</span
                >
              </div>
              <button
                class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded font-medium disabled:opacity-50 transition-colors"
                :disabled="processingContractId === contract.id"
                @click="handleRecover(contract.id)"
              >
                Recover Tasks
              </button>
            </div>

            <div
              v-if="contractHealthMap[contract.id].failedPermanentCount > 0"
              class="text-sm text-red-600 dark:text-red-400 flex items-center justify-between gap-2 bg-red-50 dark:bg-red-500/10 p-2.5 rounded-md border border-red-100 dark:border-red-500/20"
            >
              <div class="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span
                  >{{ contractHealthMap[contract.id].failedPermanentCount }} task(s) failed
                  permanently. Reset local state to clear and start fresh.</span
                >
              </div>
              <button
                class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium disabled:opacity-50 transition-colors shrink-0"
                :disabled="processingContractId === contract.id"
                @click="handleReset(contract.id)"
              >
                Reset Local State
              </button>
            </div>

            <div
              v-if="
                !contractHealthMap[contract.id].failedPermanentCount &&
                contractHealthMap[contract.id].leaseExpiredCount === 0 &&
                downloadResult?.status === 'stale_local_state' &&
                downloadResult?.contractId === contract.id &&
                processingContractId === null
              "
              class="text-sm text-red-600 dark:text-red-400 flex items-center justify-between gap-2 bg-red-50 dark:bg-red-500/10 p-2.5 rounded-md border border-red-100 dark:border-red-500/20"
            >
              <div class="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="shrink-0"
                >
                  <path
                    d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Stale local state blocks download. Reset local state required.</span>
              </div>
              <button
                class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium disabled:opacity-50 transition-colors shrink-0"
                :disabled="processingContractId === contract.id"
                @click="handleReset(contract.id)"
              >
                Reset Local State
              </button>
            </div>

            <div
              v-if="contractHealthMap[contract.id].canSubmit"
              class="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 p-2.5 rounded-md border border-emerald-200 dark:border-emerald-500/20"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="shrink-0"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>All downloaded tasks are ready to submit!</span>
            </div>

            <div
              v-if="
                contractHealthMap[contract.id].notDownloadedCount > 0 &&
                contractHealthMap[contract.id].inProgressCount === 0 &&
                contractHealthMap[contract.id].missingLocalExportCount === 0 &&
                contractHealthMap[contract.id].totalUnsyncedCount === 0
              "
              class="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-md border border-slate-200 dark:border-slate-700"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="shrink-0"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span
                >{{ contractHealthMap[contract.id].notDownloadedCount }} more task(s) available for
                download.</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State for Contracts -->
      <div
        v-else-if="!cloudFetching"
        class="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-center"
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
          No contracts assigned
        </h3>
        <p class="text-slate-500 dark:text-slate-400 text-sm mb-2 max-w-sm">
          You currently don't have any active labeling contracts assigned to this workspace.
        </p>
      </div>
    </div>
  </div>
</template>
