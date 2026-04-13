import { reactive } from 'vue'

export type ToastVariant = 'success' | 'info' | 'warning' | 'error'
export type DialogVariant = 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'dangerConfirm'

export interface ToastOptions {
  title: string
  message?: string
  variant?: ToastVariant
  duration?: number
  id?: number
}

export interface ToastItem extends ToastOptions {
  id: number
}

export interface DialogOptions {
  title: string
  message: string
  detail?: string
  variant?: DialogVariant
  primaryAction?: string
  secondaryAction?: string
  icon?: boolean
}

interface FeedbackState {
  toasts: ToastItem[]
  dialog: {
    isOpen: boolean
    options: DialogOptions
    resolve: ((value: boolean) => void) | null
  }
}

const state = reactive<FeedbackState>({
  toasts: [],
  dialog: {
    isOpen: false,
    options: { title: '', message: '' },
    resolve: null
  }
})

let toastIdGen = 0

// Global Toast functions
const showToast = (options: ToastOptions | string): void => {
  const opts = typeof options === 'string' ? { title: options } : options
  const id = ++toastIdGen
  state.toasts.push({
    id,
    variant: 'info',
    duration: 3000,
    ...opts
  })

  // Auto-dismiss
  if (opts.duration !== 0) {
    setTimeout(() => {
      removeToast(id)
    }, opts.duration || 3000)
  }
}

const removeToast = (id: number): void => {
  const idx = state.toasts.findIndex((t) => t.id === id)
  if (idx !== -1) state.toasts.splice(idx, 1)
}

const toastSuccess = (title: string, message?: string, duration?: number): void =>
  showToast({ title, message, variant: 'success', duration })
const toastError = (title: string, message?: string, duration?: number): void =>
  showToast({ title, message, variant: 'error', duration })
const toastWarning = (title: string, message?: string, duration?: number): void =>
  showToast({ title, message, variant: 'warning', duration })
const toastInfo = (title: string, message?: string, duration?: number): void =>
  showToast({ title, message, variant: 'info', duration })

// Global Dialog functions
const openDialog = (options: DialogOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    state.dialog.options = options
    state.dialog.isOpen = true
    state.dialog.resolve = resolve
  })
}

const confirmDialog = (options: DialogOptions | string): Promise<boolean> => {
  const opts = typeof options === 'string' ? { title: 'Confirm', message: options } : options
  return openDialog({
    variant: 'confirm',
    primaryAction: 'Confirm',
    secondaryAction: 'Cancel',
    icon: true,
    ...opts
  })
}

const dangerConfirmDialog = (options: DialogOptions | string): Promise<boolean> => {
  const opts = typeof options === 'string' ? { title: 'Warning', message: options } : options
  return openDialog({
    variant: 'dangerConfirm',
    primaryAction: 'Delete',
    secondaryAction: 'Cancel',
    icon: true,
    ...opts
  })
}

const closeDialog = (result: boolean): void => {
  if (state.dialog.resolve) {
    state.dialog.resolve(result)
  }
  state.dialog.isOpen = false
  state.dialog.resolve = null
}

export function useFeedback(): {
  state: FeedbackState
  toast: {
    show: (options: ToastOptions | string) => void
    success: (title: string, message?: string, duration?: number) => void
    error: (title: string, message?: string, duration?: number) => void
    warning: (title: string, message?: string, duration?: number) => void
    info: (title: string, message?: string, duration?: number) => void
    remove: (id: number) => void
  }
  dialog: {
    open: (options: DialogOptions) => Promise<boolean>
    confirm: (options: DialogOptions | string) => Promise<boolean>
    dangerConfirm: (options: DialogOptions | string) => Promise<boolean>
    close: (result: boolean) => void
  }
} {
  return {
    state,
    toast: {
      show: showToast,
      success: toastSuccess,
      error: toastError,
      warning: toastWarning,
      info: toastInfo,
      remove: removeToast
    },
    dialog: {
      open: openDialog,
      confirm: confirmDialog,
      dangerConfirm: dangerConfirmDialog,
      close: closeDialog
    }
  }
}
