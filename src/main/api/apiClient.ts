import { app } from 'electron'
import axios, { AxiosHeaders } from 'axios'
import { getAccessToken, getRefreshToken, clearSession, updateTokens } from './tokenStore'

// Base origin only. API calls below already include `/api/v1/...`.
const baseURL =
  process.env.LABELGUN_API_ORIGIN ||
  (app.isPackaged ? 'https://api.labelgun.dev' : 'http://localhost:3000')

export const apiClient = axios.create({
  baseURL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to inject Authorization header
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = AxiosHeaders.from(config.headers)
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// In-flight refresh promise to prevent parallel rotations
let refreshPromise: Promise<string | null> | null = null

// Response interceptor to handle 401s and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Check if the error is 401 and we haven't already retried this request
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't intercept auth endpoints
      if (
        originalRequest.url?.includes('/api/v1/desktop/auth/login') ||
        originalRequest.url?.includes('/api/v1/desktop/auth/refresh')
      ) {
        return Promise.reject(error)
      }

      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        clearSession()
        return Promise.reject(error)
      }

      originalRequest._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              // Create a separate axios instance for refresh to avoid interceptor loops
              const refreshClient = axios.create({ baseURL })
              const res = await refreshClient.post('/api/v1/desktop/auth/refresh', {
                refreshToken
              })

              if (res.data?.success && res.data?.data) {
                const newSession = res.data.data
                updateTokens(newSession)
                return newSession.accessToken
              }
              throw new Error('Refresh failed')
            } catch (err) {
              clearSession()
              throw err
            } finally {
              refreshPromise = null
            }
          })()
        }

        const newAccessToken = await refreshPromise

        if (newAccessToken) {
          originalRequest.headers = AxiosHeaders.from(originalRequest.headers)
          originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`)
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)
