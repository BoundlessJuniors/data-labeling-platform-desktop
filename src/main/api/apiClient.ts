import axios, { AxiosHeaders } from 'axios'
import { getToken } from './tokenStore'

const baseURL = process.env.LABELGUN_API_ORIGIN || 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to inject Authorization header
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = AxiosHeaders.from(config.headers)
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// Response interceptor (optional, can handle generic errors here)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
)
