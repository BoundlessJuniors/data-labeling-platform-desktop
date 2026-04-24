<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useCloud } from '../composables/useCloud'

// App.vue handles bootstrapSession() on mount — no bootstrap here.

const { user, isAuthenticated, isLoading: authLoading, error: authError, login, logout } = useAuth()
const { clearSession } = useCloud()

const email = ref('')
const password = ref('')

// --------------------------------------------------------------------------------
// Login
// --------------------------------------------------------------------------------
const handleLogin = async (): Promise<void> => {
  if (!email.value || !password.value) return
  try {
    await login(email.value, password.value)
    // ContractsPanel's watch(isAuthenticated, { immediate: false }) will pick up the
    // state change and fetch contracts automatically — no extra call needed here.
  } catch {
    // authError ref is populated inside useAuth.login(); no extra handling needed.
  }
}

// --------------------------------------------------------------------------------
// Logout — clears both auth state AND cloud singleton state
// --------------------------------------------------------------------------------
const handleLogout = async (): Promise<void> => {
  await logout()
  // useAuth.logout() clears user/error refs.
  // clearSession() wipes contracts, downloadResult, syncError from useCloud singleton
  // so ContractsPanel sees empty state immediately after nav back.
  clearSession()
}
</script>

<template>
  <div class="profile-panel w-full">
    <!-- ── UNAUTHENTICATED ─────────────────────────────────────────────── -->
    <div
      v-if="!isAuthenticated"
      class="max-w-3xl mx-auto flex flex-col md:flex-row bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      <!-- Branding sidebar -->
      <div
        class="md:w-5/12 p-8 bg-slate-50 dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 flex flex-col justify-center"
      >
        <div
          class="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-5"
        >
          <svg
            width="20"
            height="20"
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
        </div>
        <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">LabelGun Cloud</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
          Sign in to access your labeling contracts and stay in sync with your team.
        </p>
        <ul class="space-y-2.5 text-sm text-slate-400 dark:text-slate-500">
          <li class="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="text-blue-400 shrink-0"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Secure, token-based authentication
          </li>
          <li class="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="text-blue-400 shrink-0"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            View and manage assigned contracts
          </li>
          <li class="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="text-blue-400 shrink-0"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Submit completed work to the cloud
          </li>
        </ul>
      </div>

      <!-- Login form -->
      <div class="md:w-7/12 p-8 flex flex-col justify-center">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-5">Sign In</h2>
        <form class="space-y-4" @submit.prevent="handleLogin">
          <div>
            <label
              class="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5"
              >Email Address</label
            >
            <input
              v-model="email"
              class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              type="email"
              required
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label
              class="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5"
              >Password</label
            >
            <input
              v-model="password"
              class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              type="password"
              required
              placeholder="••••••••"
            />
          </div>

          <!-- Error alert -->
          <div
            v-if="authError"
            class="border-l-4 border-red-500 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 p-3 rounded-r-md flex items-start gap-2 text-sm"
          >
            <svg
              width="15"
              height="15"
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
            class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            type="submit"
            :disabled="authLoading"
          >
            {{ authLoading ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>
      </div>
    </div>

    <!-- ── AUTHENTICATED ───────────────────────────────────────────────── -->
    <div
      v-else
      class="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      <!-- Header -->
      <div class="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
        <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Account</h2>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Your active session and profile information.
        </p>
      </div>

      <!-- Profile card body -->
      <div class="px-6 py-6 flex flex-col gap-5">
        <!-- Avatar + identity -->
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center font-bold text-lg text-blue-600 dark:text-blue-400 shrink-0 select-none"
          >
            {{ user?.email ? user.email.charAt(0).toUpperCase() : 'U' }}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
              {{ user?.email }}
            </div>
            <div class="mt-1.5 inline-flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400"></span>
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">{{
                user?.role ?? 'labeler'
              }}</span>
            </div>
          </div>
        </div>

        <!-- Session status -->
        <div
          class="border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-r-md flex items-center gap-2.5 text-sm"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="shrink-0"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Session active — connected to LabelGun Cloud</span>
        </div>

        <!-- Sign out -->
        <div class="pt-1">
          <button
            class="px-4 py-2 flex items-center gap-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
            :disabled="authLoading"
            @click="handleLogout"
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {{ authLoading ? 'Signing out…' : 'Sign Out' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
