import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'

// Her uygulama oturumu için tek bir cookie jar.
// Main Process'te yaşar — Renderer katmanı bunu hiçbir zaman doğrudan görmez.
export let cookieJar = new CookieJar()

const _rawClient = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true, // cookie gönder / al
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// tough-cookie entegrasyonunu etkinleştir
export const apiClient = wrapper(_rawClient)
apiClient.defaults.jar = cookieJar

/**
 * Cookie jar'ı tamamen temizler (logout sonrası çağrılır).
 */
export function clearCookies(): void {
  cookieJar = new CookieJar()
  apiClient.defaults.jar = cookieJar
}
