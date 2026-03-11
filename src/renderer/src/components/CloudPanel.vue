<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useCloud, type SubmitResult } from '../composables/useCloud'

const emit = defineEmits<{
  (e: 'dataset-downloaded'): void
}>()

const { user, isAuthenticated, isLoading: authLoading, error: authError, login, logout } = useAuth()
const {
  contracts,
  isFetching: cloudFetching,
  syncError,
  downloadResult,
  fetchContracts,
  downloadContractWork,
  syncNow,
  submitContract
} = useCloud()

// Form durumları
const email = ref('')
const password = ref('')
const processingContractId = ref<string | null>(null)
const downloadAmount = ref(20)
const isSyncing = ref(false)
const submitResult = ref<SubmitResult | null>(null)

// --------------------------------------------------------------------------------
// Giriş İşlemi
// --------------------------------------------------------------------------------
const handleLogin = async (): Promise<void> => {
  if (!email.value || !password.value) return
  try {
    await login(email.value, password.value)
    if (isAuthenticated.value) {
      await fetchContracts()
    }
  } catch (err) {
    console.error('Login failed', err)
  }
}

// --------------------------------------------------------------------------------
// İndirme İşlemi (Lease-batch + Download)
// --------------------------------------------------------------------------------
const handleDownload = async (contractId: string, contractTitle: string): Promise<void> => {
  processingContractId.value = contractId
  try {
    const amount = Math.min(Math.max(1, downloadAmount.value), 100)
    await downloadContractWork(contractId, contractTitle, amount)
    emit('dataset-downloaded')
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
  try {
    await syncNow()
  } catch (err) {
    console.error('Sync failed', err)
  } finally {
    isSyncing.value = false
  }
}

// --------------------------------------------------------------------------------
// Sözleşme Teslim Et
// --------------------------------------------------------------------------------
const handleSubmitContract = async (contractId: string): Promise<void> => {
  processingContractId.value = contractId
  submitResult.value = null
  try {
    const result = await submitContract(contractId)
    submitResult.value = result
    if (result.ok) {
      await fetchContracts()
    }
  } catch (err) {
    console.error('Contract submit failed', err)
  } finally {
    processingContractId.value = null
  }
}

// --------------------------------------------------------------------------------
// Component Mount
// --------------------------------------------------------------------------------
onMounted(async (): Promise<void> => {
  if (isAuthenticated.value) {
    await fetchContracts()
  }
})
</script>

<template>
  <div
    class="cloud-panel w-full max-w-2xl mx-auto mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 transition-colors"
  >
    <!-- DURUM 1: GİRİŞ YAPILMAMIŞ -->
    <div v-if="!isAuthenticated" class="login-form">
      <h2 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        Bulut Hesabına Giriş Yap
      </h2>

      <form class="space-y-4" @submit.prevent="handleLogin">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            E-posta
          </label>
          <input
            v-model="email"
            class="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="email"
            required
            placeholder="ornek@sirket.com"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Şifre
          </label>
          <input
            v-model="password"
            class="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="password"
            required
            placeholder="••••••••"
          />
        </div>

        <div v-if="authError" class="text-red-500 text-sm mt-2">
          {{ authError }}
        </div>

        <button
          class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow disabled:opacity-50 transition-colors"
          type="submit"
          :disabled="authLoading"
        >
          {{ authLoading ? 'Giriş Yapılıyor...' : 'Giriş Yap' }}
        </button>
      </form>
    </div>

    <!-- DURUM 2: GİRİŞ YAPILMIŞ -->
    <div v-else class="cloud-workspace">
      <div
        class="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700"
      >
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
          Hoş geldin, <span class="text-blue-600 dark:text-blue-400">{{ user?.email }}</span>
        </h2>
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800 rounded-md font-medium transition-colors text-sm disabled:opacity-50"
            :disabled="isSyncing"
            @click="handleSync"
          >
            {{ isSyncing ? 'Eşitleniyor...' : 'Şimdi Eşitle' }}
          </button>
          <button
            class="px-4 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800 rounded-md font-medium transition-colors"
            @click="logout"
          >
            Çıkış Yap
          </button>
        </div>
      </div>

      <div
        v-if="cloudFetching && !processingContractId"
        class="text-center text-gray-500 dark:text-gray-400 py-8"
      >
        Sözleşmeler yükleniyor...
      </div>

      <div
        v-if="syncError"
        class="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-md mb-4 border border-red-200 dark:border-red-800"
      >
        {{ syncError }}
      </div>

      <div
        v-if="downloadResult"
        class="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 p-4 rounded-md mb-4 border border-green-200 dark:border-green-800"
      >
        İndirme Tamamlandı: {{ downloadResult.leased }} kiralandı,
        {{ downloadResult.downloaded }} indirildi, {{ downloadResult.skipped }} atlandı,
        {{ downloadResult.failed }} hata.
      </div>

      <!-- Submit result -->
      <div
        v-if="submitResult && !submitResult.ok"
        class="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 p-4 rounded-md mb-4 border border-yellow-200 dark:border-yellow-800"
      >
        Teslim edilemedi: {{ submitResult.error }}
        <span v-if="submitResult.unsyncedCount">
          ({{ submitResult.unsyncedCount }} senkronize edilmemiş görev<span
            v-if="submitResult.failedCount"
            >, {{ submitResult.failedCount }} kalıcı hata</span
          >)
        </span>
      </div>

      <div
        v-if="submitResult && submitResult.ok"
        class="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 p-4 rounded-md mb-4 border border-green-200 dark:border-green-800"
      >
        ✅ Sözleşme başarıyla teslim edildi.
      </div>

      <div v-if="(contracts || []).length > 0" class="space-y-4">
        <div
          v-for="contract in contracts || []"
          :key="contract.id"
          class="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
        >
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="font-semibold text-lg text-gray-900 dark:text-gray-100">
                {{ contract.listing?.title || 'İsimsiz Sözleşme' }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Durumu:
                <span class="font-medium text-gray-700 dark:text-gray-300">{{
                  contract.status
                }}</span>
              </p>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-3 flex-wrap">
            <!-- Download amount input + İndir button -->
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-600 dark:text-gray-400">Adet:</label>
              <input
                v-model.number="downloadAmount"
                type="number"
                min="1"
                max="100"
                class="w-16 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                class="px-4 py-2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-white rounded-md font-medium disabled:opacity-50 transition-colors shadow-sm text-sm"
                :disabled="cloudFetching || processingContractId === contract.id"
                @click="handleDownload(contract.id, contract.listing?.title || 'Bulut_Dataset')"
              >
                <span v-if="processingContractId === contract.id">İndiriliyor...</span>
                <span v-else>İndir</span>
              </button>
            </div>

            <!-- Submit Contract button -->
            <button
              v-if="contract.status === 'active' || contract.status === 'revision_requested'"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50 transition-colors shadow-sm text-sm"
              :disabled="cloudFetching || processingContractId === contract.id"
              @click="handleSubmitContract(contract.id)"
            >
              <span v-if="processingContractId === contract.id">Teslim Ediliyor...</span>
              <span v-else>Teslim Et</span>
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="!cloudFetching" class="text-center text-gray-500 dark:text-gray-400 py-8">
        Henüz atanmış bir sözleşmeniz bulunmuyor.
      </div>
    </div>
  </div>
</template>
