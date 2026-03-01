import { app, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { Worker } from 'worker_threads'

// Tip import'u için dinamik import kullanacağız; böylece uygulama açılırken
// native modül hemen yüklenmek zorunda kalmaz.

import type * as Ort from 'onnxruntime-node'

export type SamModelId = 'vit_b' | 'vit_l' | 'vit_h'

export interface SamModelConfig {
  id: SamModelId
  name: string
  description: string
  size: string
  encoderUrl: string
  decoderUrl: string
  encoderFile: string
  decoderFile: string
  quantized: boolean
}

// Hugging Face URLs for Quantized Models
export const SAM_MODELS: Record<SamModelId, SamModelConfig> = {
  vit_b: {
    id: 'vit_b',
    name: 'Fast (ViT-B)',
    description: 'Fastest model, lower memory usage. Good for general use.',
    size: '~130 MB',
    encoderUrl:
      'https://huggingface.co/visheratin/segment-anything-vit-b/resolve/main/encoder-quant.onnx',
    decoderUrl:
      'https://huggingface.co/visheratin/segment-anything-vit-b/resolve/main/decoder-quant.onnx',
    encoderFile: 'encoder-quant.onnx',
    decoderFile: 'decoder-quant.onnx',
    quantized: true
  },
  vit_l: {
    id: 'vit_l',
    name: 'Balanced (ViT-L)',
    description: 'Better accuracy, moderate speed. Recommended for complex images.',
    size: '~350 MB',
    encoderUrl:
      'https://huggingface.co/visheratin/segment-anything-vit-l/resolve/main/encoder-quant.onnx',
    decoderUrl:
      'https://huggingface.co/visheratin/segment-anything-vit-l/resolve/main/decoder-quant.onnx',
    encoderFile: 'encoder-quant.onnx',
    decoderFile: 'decoder-quant.onnx',
    quantized: true
  },
  vit_h: {
    id: 'vit_h',
    name: 'High Quality (ViT-H)',
    description: 'Best accuracy, slowest speed. High memory usage.',
    size: '~700 MB',
    encoderUrl:
      'https://huggingface.co/visheratin/segment-anything-vit-h/resolve/main/encoder-quant.onnx',
    decoderUrl:
      'https://huggingface.co/visheratin/segment-anything-vit-h/resolve/main/decoder-quant.onnx',
    encoderFile: 'encoder-quant.onnx',
    decoderFile: 'decoder-quant.onnx',
    quantized: true
  }
}

export type SamStatus = 'idle' | 'downloading' | 'ready' | 'error' | 'loading'

// GPU Provider Information
export interface ProviderInfo {
  name: string
  available: boolean
  priority: number
  options?: Record<string, unknown>
}

export interface GpuInfo {
  provider: string | null
  platform: string
  availableProviders: string[]
}

export interface SamState {
  status: SamStatus
  currentModelId: SamModelId
  downloadProgress: Record<SamModelId, number | null> // 0-1 or null if not downloading
  modelsStatus: Record<SamModelId, 'available' | 'not_downloaded'>
  error: string | null
  gpuInfo: GpuInfo | null
}

let ortModule: typeof Ort | null = null
// samEncoderSession removed, handled by worker
let samDecoderSession: Ort.InferenceSession | null = null

// Initialize State
const samState: SamState = {
  status: 'idle',
  currentModelId: 'vit_b',
  downloadProgress: { vit_b: null, vit_l: null, vit_h: null },
  modelsStatus: { vit_b: 'not_downloaded', vit_l: 'not_downloaded', vit_h: 'not_downloaded' },
  error: null,
  gpuInfo: null
}

export interface SamDownloadProgress {
  modelId: SamModelId
  stage: 'encoder' | 'decoder'
  loaded: number
  total: number | null
}

function getModelsRootDir(): string {
  const userData = app.getPath('userData')
  return join(userData, 'models', 'sam')
}

function getModelDir(modelId: SamModelId): string {
  const root = getModelsRootDir()
  const dir = join(root, modelId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

const activeDownloads = new Map<string, AbortController>()

export function getSamState(): SamState {
  // Sync existence check
  for (const key of Object.keys(SAM_MODELS)) {
    const mId = key as SamModelId
    const dir = getModelDir(mId)
    const config = SAM_MODELS[mId]
    const exists =
      existsSync(join(dir, config.encoderFile)) && existsSync(join(dir, config.decoderFile))

    // Check if paused (partial file exists but not downloading)
    if (!exists && !activeDownloads.has(mId)) {
      // Simple check: if part file exists, we can consider it "paused" or just "downloading_interrupted"
      // For UI simplicity, we might just report "not_downloaded" but allow resume which auto-detects.
      // Or we can explicitly check for .part files to show "Paused" in UI.
      const encPart = existsSync(join(dir, config.encoderFile + '.part'))
      const decPart = existsSync(join(dir, config.decoderFile + '.part'))
      if (encPart || decPart) {
        // We could add a 'paused' status to modelsStatus if we want to be explicit
      }
    }

    samState.modelsStatus[mId] = exists ? 'available' : 'not_downloaded'
  }
  return { ...samState }
}

export async function isModelDownloaded(modelId: SamModelId): Promise<boolean> {
  const dir = getModelDir(modelId)
  const config = SAM_MODELS[modelId]
  return existsSync(join(dir, config.encoderFile)) && existsSync(join(dir, config.decoderFile))
}

export async function pauseSamDownload(modelId: SamModelId): Promise<void> {
  const controller = activeDownloads.get(modelId)
  if (controller) {
    controller.abort('paused') // Pass reason
    activeDownloads.delete(modelId)
    samState.status = 'idle'
    samState.downloadProgress[modelId] = null // Clear progress to stop UI spinner, or keep it?
    // Let's keep last known progress? No, state refresh will clear it.
    // We will need to re-calc progress on resume.
  }
}

export async function cancelSamDownload(modelId: SamModelId): Promise<void> {
  const controller = activeDownloads.get(modelId)
  if (controller) {
    controller.abort('cancelled')
    activeDownloads.delete(modelId)
  }

  // Cleanup partial files
  const dir = getModelDir(modelId)
  const config = SAM_MODELS[modelId]
  try {
    const fs = await import('fs/promises')
    await fs.rm(join(dir, config.encoderFile + '.part'), { force: true })
    await fs.rm(join(dir, config.decoderFile + '.part'), { force: true })
    // Also remove completed files if any, to ensure clean slate?
    // Maybe yes if "Cancel" means "I don't want this".
    await fs.rm(join(dir, config.encoderFile), { force: true })
    await fs.rm(join(dir, config.decoderFile), { force: true })
  } catch (e) {
    console.error('Error cleaning up cancelled download:', e)
  }

  samState.status = 'idle'
  samState.downloadProgress[modelId] = null
  samState.modelsStatus[modelId] = 'not_downloaded'
}

export async function downloadSamModel(
  modelId: SamModelId,
  onProgress?: (p: SamDownloadProgress) => void
): Promise<void> {
  if (activeDownloads.has(modelId)) return // Already downloading

  const controller = new AbortController()
  activeDownloads.set(modelId, controller)

  samState.status = 'downloading'
  samState.downloadProgress[modelId] = 0 // Start/Reset
  samState.error = null

  try {
    const config = SAM_MODELS[modelId]
    const dir = getModelDir(modelId)

    const downloadOne = async (
      url: string,
      finalFileName: string,
      stage: SamDownloadProgress['stage']
    ): Promise<void> => {
      if (controller.signal.aborted) return

      const partFile = finalFileName + '.part'
      const partPath = join(dir, partFile)
      const finalPath = join(dir, finalFileName)

      if (existsSync(finalPath)) {
        // Already done
        onProgress?.({ modelId, stage, loaded: 1, total: 1 })
        return
      }

      // Check for partial
      let startByte = 0
      if (existsSync(partPath)) {
        const importFs = await import('fs')
        const stats = importFs.statSync(partPath)
        startByte = stats.size
      }

      const headers: Record<string, string> = {}
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`
      }

      console.log(`Downloading ${stage} for ${modelId} starting at ${startByte}`)

      const res = await net.fetch(url, {
        headers,
        signal: controller.signal
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
      }

      const totalHeader = res.headers.get('content-length')
      // If Range used, content-length is remaining. Total is start + remaining.
      // If not, content-length is total.
      const contentLength = totalHeader ? Number.parseInt(totalHeader, 10) : 0
      const total = startByte + contentLength

      const flags = startByte > 0 ? 'a' : 'w' // Append or Write
      const fileStream = createWriteStream(partPath, { flags })

      const body = res.body
      if (!body) {
        throw new Error('No response body')
      }

      const reader = body.getReader()
      let loaded = startByte

      // Initial progress report
      onProgress?.({ modelId, stage, loaded, total: total || null })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          loaded += value.byteLength
          fileStream.write(Buffer.from(value))
          // Throttle progress updates?
          onProgress?.({ modelId, stage, loaded, total: total || null })

          // Update global state for UI polling if needed
          if (total) {
            // Average progress if we want a single number, but current structure supports per-model
            // We just update the callback mostly.
          }
        }
      }

      fileStream.end()

      // Rename .part to final
      const fsPromises = await import('fs/promises')
      await fsPromises.rename(partPath, finalPath)
    }

    // Download Encoder
    await downloadOne(config.encoderUrl, config.encoderFile, 'encoder')
    // Download Decoder
    await downloadOne(config.decoderUrl, config.decoderFile, 'decoder')

    activeDownloads.delete(modelId)
    samState.downloadProgress[modelId] = null
    samState.modelsStatus[modelId] = 'available'

    // If this is the current model, ensure it's loaded
    if (samState.currentModelId === modelId) {
      samState.status = 'idle'
    } else {
      samState.status = 'idle'
    }
  } catch (err) {
    activeDownloads.delete(modelId)
    const isAborted = (err as Error).name === 'AbortError' || controller.signal.aborted

    if (isAborted) {
      console.log(`Download for ${modelId} paused/cancelled.`)
      samState.status = 'idle'
      // Do not set error state for pause/cancel
    } else {
      console.error(`[SAM] model ${modelId} download failed:`, err)
      samState.status = 'error'
      samState.downloadProgress[modelId] = null
      samState.error = err instanceof Error ? err.message : String(err)
      throw err
    }
  }
}

export async function switchSamModel(modelId: SamModelId): Promise<void> {
  if (modelId === samState.currentModelId && samState.status === 'ready') return

  // Unload current sessions to free memory
  // Unload current sessions to free memory
  // samEncoderSession is in worker, handled by re-init or we can send 'release' message if needed
  // For now, next init will release old one in worker.
  if (samDecoderSession) {
    try {
      ;(samDecoderSession as { release?: () => void }).release?.()
    } catch {
      /* ignore */
    }
    samDecoderSession = null
  }

  // Clear cache as embeddings are model-specific
  embeddingCache.clear()

  samState.currentModelId = modelId
  samState.status = 'idle'

  // If downloaded, load immediately? Or wait for first inference?
  // Let's wait for inference or explicit load call to invoke ensureSamSessionLoaded
}

async function ensureOrtLoaded(): Promise<typeof Ort> {
  if (ortModule) return ortModule

  const mod = (await import('onnxruntime-node')) as typeof Ort
  ortModule = mod
  return mod
}

/**
 * GPU Provider Detection and Configuration
 */

function getCudaOptions(): Record<string, unknown> {
  return {
    deviceId: 0,
    cudnnConvAlgoSearch: 'DEFAULT',
    cudnnConvUseMaxWorkspace: true,
    enableCudaGraph: true,
    cudaMallocBehavior: 0
  }
}

function getDirectMLOptions(): Record<string, unknown> {
  return {
    deviceId: 0,
    enableGraphCapture: true
  }
}

function getCoreMLOptions(): Record<string, unknown> {
  return {
    // CoreML default options
  }
}

async function detectAvailableProviders(): Promise<ProviderInfo[]> {
  const platform = process.platform
  const providers: ProviderInfo[] = []

  console.log(`[SAM-GPU] Detecting providers on platform: ${platform}`)

  // CUDA - Available on Windows and Linux with NVIDIA GPUs
  if (platform === 'win32' || platform === 'linux') {
    try {
      // CUDA provider detection - will be tested during session creation
      providers.push({
        name: 'cuda',
        available: true, // Will be tested during session creation
        priority: 5,
        options: getCudaOptions()
      })
      console.log('[SAM-GPU] CUDA provider added to candidate list')
    } catch (e) {
      console.log('[SAM-GPU] CUDA provider not available:', (e as Error).message)
    }
  }

  // DirectML - Available on Windows 10+ with any GPU
  // Try multiple provider name variations as ONNX Runtime might use different names
  if (platform === 'win32') {
    try {
      // DirectML can be named 'directml', 'DML', or 'DirectML' depending on version
      const directMLVariants = [
        { name: 'directml', priority: 6 },
        { name: 'DML', priority: 7 },
        { name: 'DirectML', priority: 8 }
      ]

      for (const variant of directMLVariants) {
        providers.push({
          name: variant.name,
          available: true,
          priority: variant.priority,
          options: getDirectMLOptions()
        })
      }

      console.log(
        '[SAM-GPU] DirectML provider variants added to candidate list:',
        directMLVariants.map((v) => v.name).join(', ')
      )
    } catch (e) {
      console.log('[SAM-GPU] DirectML provider not available:', (e as Error).message)
    }
  }

  // WebGPU - Experimental on Windows (modern GPUs)
  if (platform === 'win32') {
    try {
      providers.push({
        name: 'webgpu',
        available: true,
        priority: 1, // First priority - fastest to detect and works great
        options: {}
      })
      console.log('[SAM-GPU] WebGPU provider added to candidate list (experimental)')
    } catch (e) {
      console.log('[SAM-GPU] WebGPU provider not available:', (e as Error).message)
    }
  }

  // CoreML - Available on macOS
  if (platform === 'darwin') {
    try {
      providers.push({
        name: 'coreml',
        available: true,
        priority: 1,
        options: getCoreMLOptions()
      })
      console.log('[SAM-GPU] CoreML provider added to candidate list')
    } catch (e) {
      console.log('[SAM-GPU] CoreML provider not available:', (e as Error).message)
    }
  }

  // CPU - Always available as fallback
  providers.push({
    name: 'cpu',
    available: true,
    priority: 99,
    options: {}
  })
  console.log('[SAM-GPU] CPU provider added as fallback')

  return providers.sort((a, b) => a.priority - b.priority)
}

function buildSessionOptions(
  providers: ProviderInfo[],
  useDirectML: boolean
): Ort.InferenceSession.SessionOptions {
  const executionProviders = providers
    .filter((p) => p.available)
    .map((p) => {
      if (p.options && Object.keys(p.options).length > 0) {
        return { name: p.name, ...p.options }
      }
      return p.name
    })

  const sessionOptions: Ort.InferenceSession.SessionOptions = {
    executionProviders,
    executionMode: 'sequential', // Required for DirectML and recommended for large models
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
    enableMemPattern: !useDirectML, // Must be false for DirectML
    logSeverityLevel: 2,
    logVerbosityLevel: 0
  }

  return sessionOptions
}

export async function ensureSamSessionLoaded(): Promise<void> {
  if (samDecoderSession && samWorker) return

  const modelId = samState.currentModelId
  const downloaded = await isModelDownloaded(modelId)

  if (!downloaded) {
    throw new Error(`SAM model ${modelId} not found. Please download it first.`)
  }

  samState.status = 'loading'

  try {
    console.log('[SAM-GPU] Initializing sessions...')

    const ort = await ensureOrtLoaded()
    const dir = getModelDir(modelId)
    const config = SAM_MODELS[modelId]

    const decoderPath = join(dir, config.decoderFile)

    // Detect available GPU providers
    const providers = await detectAvailableProviders()
    const availableProviderNames = providers.map((p) => p.name)

    console.log('[SAM-GPU] Available providers:', availableProviderNames)

    // Try each provider in priority order
    let sessionCreated = false
    let activeProvider: string | null = null

    for (const provider of providers) {
      if (!provider.available) continue

      try {
        console.log(`[SAM-GPU] Attempting to load sessions with provider: ${provider.name}`)

        // Check if DirectML is in the providers list for special config
        const useDirectML = provider.name === 'directml'

        // Build session options for this provider attempt
        const sessionOptions = buildSessionOptions([provider], useDirectML)

        console.log(`[SAM-GPU] Session options:`, {
          executionProviders: sessionOptions.executionProviders,
          executionMode: sessionOptions.executionMode,
          enableMemPattern: sessionOptions.enableMemPattern
        })

        // Create decoder session (Main thread)
        samDecoderSession = await ort.InferenceSession.create(decoderPath, sessionOptions)

        console.log(
          '[SAM-GPU] Decoder session providers:',
          (samDecoderSession as { executionProviders?: string[] }).executionProviders ||
            provider.name
        )

        // Init Encoder in Worker
        console.log('[SAM-GPU] Initializing Encoder Worker...')
        await initWorker(modelId)

        console.log(`[SAM-GPU] ✓ Successfully loaded sessions with provider: ${provider.name}`)

        activeProvider = provider.name
        sessionCreated = true
        break
      } catch (error) {
        // Clean up any partially created sessions
        // Clean up any partially created sessions
        // samEncoderSession handled by worker
        if (samDecoderSession) {
          try {
            ;(samDecoderSession as { release?: () => void }).release?.()
          } catch {
            /* ignore */
          }
          samDecoderSession = null
        }

        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : ''

        console.warn(`[SAM-GPU] ❌ Failed to load with ${provider.name}`)
        console.warn(`[SAM-GPU]    Error: ${errorMsg}`)

        // Detailed diagnostics for DirectML failures
        if (provider.name.toLowerCase().includes('directml') || provider.name === 'DML') {
          console.warn('[SAM-GPU]    DirectML Diagnostics:')
          console.warn(
            '[SAM-GPU]      - DirectML.dll should be in node_modules/onnxruntime-node/bin/napi-v6/win32/x64/'
          )
          console.warn('[SAM-GPU]      - Windows 10 1903+ or Windows 11 required')
          console.warn('[SAM-GPU]      - Try alternative provider names: directml, DML, DirectML')
          if (errorStack) {
            console.warn(
              '[SAM-GPU]      Stack trace:',
              errorStack.split('\n').slice(0, 3).join('\n')
            )
          }
        }

        // Continue to next provider
      }
    }

    if (!sessionCreated) {
      throw new Error('Failed to create SAM sessions with any available provider')
    }

    // Update state with GPU info
    samState.gpuInfo = {
      provider: activeProvider,
      platform: process.platform,
      availableProviders: availableProviderNames
    }

    samState.status = 'ready'

    console.log('[SAM-GPU] Sessions ready. Active provider:', activeProvider)
  } catch (e) {
    samState.status = 'error'
    samState.error = e instanceof Error ? e.message : String(e)
    samState.gpuInfo = null
    throw e
  }
}

export interface SamPoint {
  x: number
  y: number
}

export interface SamMaskResult {
  points: { x: number; y: number }[]
}

const SAM_IMAGE_SIZE = 1024

interface ImageEmbeddingCacheEntry {
  embedding: Ort.Tensor
  origWidth: number
  origHeight: number
  modelId: SamModelId
  lastUsed: number // Timestamp for LRU
}

const embeddingCache = new Map<string, ImageEmbeddingCacheEntry>()
const MAX_CACHE_SIZE = 10 // Keep last 10 embeddings to prevent memory leak

/**
 * LRU Cache cleanup - removes least recently used entries
 */
function cleanupEmbeddingCache(): void {
  if (embeddingCache.size <= MAX_CACHE_SIZE) return

  // Sort by lastUsed timestamp and remove oldest
  const entries = Array.from(embeddingCache.entries())
  entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed)

  const toRemove = entries.length - MAX_CACHE_SIZE
  for (let i = 0; i < toRemove; i++) {
    embeddingCache.delete(entries[i][0])
    console.log(`[SAM-GPU] Removed old embedding from cache: ${entries[i][0]}`)
  }
}

/* ========================================
   SMART PREFETCH CACHE SYSTEM
   ======================================== */

interface CacheJob {
  imagePath: string
  taskIndex: number
  priority: 'high' | 'medium' | 'low'
  timestamp: number
}

interface CachePlan {
  backward: number[]
  current: number
  forward: number[]
}

class SmartCacheQueue {
  private queue: CacheJob[] = []
  private processing: boolean = false
  private paused: boolean = false
  private lastUserActivity: number = Date.now()
  private processingTaskIndex: number | null = null
  private processingInterval: NodeJS.Timeout | null = null

  recordUserActivity(): void {
    this.lastUserActivity = Date.now()
  }

  isUserIdle(): boolean {
    return Date.now() - this.lastUserActivity > 500
  }

  isRapidSwitching(): boolean {
    return Date.now() - this.lastUserActivity < 200
  }

  isGpuBusy(): boolean {
    return samState.status === 'loading' || this.processingTaskIndex !== null
  }

  queueJob(job: CacheJob): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)

    // Check if already cached
    const cached = embeddingCache.get(job.imagePath)
    if (cached && cached.modelId === samState.currentModelId) {
      console.log(`[${timestamp}] [Prefetch] ⏭️  Task ${job.taskIndex} already cached, skipping`)
      return
    }

    // Check if already queued
    const exists = this.queue.find((j) => j.imagePath === job.imagePath)
    if (exists) {
      // Update priority if higher
      if (this.getPriorityValue(job.priority) < this.getPriorityValue(exists.priority)) {
        console.log(
          `[${timestamp}] [Prefetch] 🔼 Task ${job.taskIndex} priority updated: ${exists.priority} → ${job.priority}`
        )
        exists.priority = job.priority
      }
      return
    }

    this.queue.push(job)
    this.sortQueue()
    const imageName = job.imagePath.split(/[\\/]/).pop() || job.imagePath
    console.log(
      `[${timestamp}] [Prefetch] ➕ Queued task ${job.taskIndex} (${job.priority}): ${imageName} | Queue size: ${this.queue.length}`
    )
  }

  removeJobs(predicate: (job: CacheJob) => boolean): number {
    const before = this.queue.length
    this.queue = this.queue.filter((j) => !predicate(j))
    return before - this.queue.length
  }

  clear(): void {
    this.queue = []
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    void this.processNext()
  }

  private getNextJob(): CacheJob | null {
    return this.queue.length > 0 ? this.queue[0] : null
  }

  private getPriorityValue(priority: string): number {
    return { high: 1, medium: 2, low: 3 }[priority] || 99
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const diff = this.getPriorityValue(a.priority) - this.getPriorityValue(b.priority)
      if (diff !== 0) return diff
      return a.timestamp - b.timestamp
    })
  }

  async processNext(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)

    if (this.processing) {
      return
    }
    if (this.paused) {
      console.log(`[${timestamp}] [Prefetch] ⏸️  Queue paused, skipping process`)
      return
    }
    if (!this.isUserIdle()) {
      return // Silent when user active
    }
    if (this.isGpuBusy()) {
      return // Silent when GPU busy
    }

    const job = this.getNextJob()
    if (!job) {
      return // Silent when queue empty
    }

    this.processing = true
    this.processingTaskIndex = job.taskIndex

    const imageName = job.imagePath.split(/[\\/]/).pop() || job.imagePath
    console.log(
      `[${timestamp}] [Prefetch] 🚀 START encoding task ${job.taskIndex} (${job.priority}): ${imageName}`
    )
    const startTime = performance.now()

    try {
      await computeImageEmbedding(job.imagePath)

      const elapsed = performance.now() - startTime
      // Remove from queue
      this.queue = this.queue.filter((j) => j !== job)
      console.log(
        `[${timestamp}] [Prefetch] ✅ DONE task ${job.taskIndex} in ${elapsed.toFixed(0)}ms | Remaining queue: ${this.queue.length}`
      )
    } catch (e) {
      const elapsed = performance.now() - startTime
      console.error(
        `[${timestamp}] [Prefetch] ❌ FAILED task ${job.taskIndex} after ${elapsed.toFixed(0)}ms:`,
        (e as Error).message
      )
    } finally {
      this.processing = false
      this.processingTaskIndex = null

      // Continue after longer throttle (2s instead of 100ms) to avoid overwhelming system
      setTimeout(() => {
        void this.processNext()
      }, 2000) // 2 second delay between jobs
    }
  }

  startProcessing(): void {
    if (this.processingInterval) {
      console.log('[Prefetch] ⚠️  Processing already started, skipping')
      return
    }

    // Slower interval to avoid UI lag (500ms instead of 200ms)
    this.processingInterval = setInterval(() => {
      if (this.isRapidSwitching()) {
        if (!this.paused) {
          const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
          console.log(
            `[${timestamp}] [Prefetch] ⏸️  Rapid switching detected, pausing queue for 1s`
          )
          this.pause()
          setTimeout(() => {
            const ts2 = new Date().toISOString().split('T')[1].slice(0, -1)
            console.log(`[${ts2}] [Prefetch] ▶️  Resuming queue after pause`)
            this.resume()
          }, 1000)
        }
      } else {
        void this.processNext()
      }
    }, 500) // 500ms interval instead of 200ms - less aggressive

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
    console.log(`[${timestamp}] [Prefetch] 🎬 Background processing STARTED (checking every 500ms)`)
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
  }
}

// Global prefetch queue instance
const prefetchQueue = new SmartCacheQueue()

/**
 * Calculate cache plan: 1 backward + current + 2 forward = 4 total (less aggressive)
 */
function getCachePlan(currentIndex: number, totalTasks: number): CachePlan {
  const plan: CachePlan = {
    backward: [],
    current: currentIndex,
    forward: []
  }

  // Backward 1 (reduced from 3)
  const backIdx = currentIndex - 1
  if (backIdx >= 0) {
    plan.backward.push(backIdx)
  }

  // Forward 2 (reduced from 6)
  for (let i = 1; i <= 2; i++) {
    const idx = currentIndex + i
    if (idx < totalTasks) {
      plan.forward.push(idx)
    }
  }

  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
  console.log(`[${timestamp}] [Prefetch] 📋 Cache plan for task ${currentIndex}/${totalTasks - 1}:`)
  console.log(
    `[${timestamp}] [Prefetch]    Backward (${plan.backward.length}): [${plan.backward.join(', ')}]`
  )
  console.log(`[${timestamp}] [Prefetch]    Current: ${plan.current}`)
  console.log(
    `[${timestamp}] [Prefetch]    Forward (${plan.forward.length}): [${plan.forward.join(', ')}]`
  )

  return plan
}

/**
 * Update prefetch plan based on current task navigation
 */
export function updatePrefetchPlan(
  currentIndex: number,
  totalTasks: number,
  tasks: { image?: string }[]
): void {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
  console.log(`\n[${timestamp}] [Prefetch] ═══════════════════════════════════════`)
  console.log(`[${timestamp}] [Prefetch] 🎯 UPDATE PLAN: Navigated to task ${currentIndex}`)

  const plan = getCachePlan(currentIndex, totalTasks)

  // Remove old entries (4+ back)
  const oldThreshold = currentIndex - 4
  const removedCount = prefetchQueue.removeJobs((job) => job.taskIndex < oldThreshold)

  if (removedCount > 0) {
    console.log(
      `[${timestamp}] [Prefetch] 🗑️  Removed ${removedCount} old jobs (< task ${oldThreshold})`
    )
  }

  // Helper to queue a task
  const queueTask = (idx: number, priority: 'high' | 'medium' | 'low'): void => {
    if (idx >= 0 && idx < tasks.length && tasks[idx]) {
      const task = tasks[idx]
      if (task.image) {
        prefetchQueue.queueJob({
          imagePath: task.image,
          taskIndex: idx,
          priority,
          timestamp: Date.now()
        })
      }
    }
  }

  // Queue current task (HIGH priority) - ensures startup/jump to task is handled
  queueTask(plan.current, 'high')

  // Queue backward images (last one MEDIUM, others LOW)
  plan.backward.forEach((idx, i) => {
    const priority = i === plan.backward.length - 1 ? 'medium' : 'low'
    queueTask(idx, priority)
  })

  // Queue forward images (first 2 MEDIUM, others LOW)
  plan.forward.forEach((idx, i) => {
    const priority = i < 2 ? 'medium' : 'low'
    queueTask(idx, priority)
  })
}

/**
 * Record user activity for prefetch timing
 */
export function recordPrefetchActivity(): void {
  prefetchQueue.recordUserActivity()
}

/**
 * Start prefetch background processing
 */
export function startPrefetchProcessing(): void {
  prefetchQueue.startProcessing()
}

/**
 * Stop prefetch background processing
 */
export function stopPrefetchProcessing(): void {
  prefetchQueue.stopProcessing()
}

/**
 * Clear prefetch queue (e.g., on model change)
 */
export function clearPrefetchQueue(): void {
  prefetchQueue.clear()
  console.log('[Prefetch] Queue cleared')
}

// Restore helper needed for coordinates
function getResizeScale(width: number, height: number): number {
  const longSide = Math.max(width, height)
  return SAM_IMAGE_SIZE / longSide
}

interface PendingRequest {
  resolve: (res: ImageEmbeddingCacheEntry) => void
  reject: (err: Error) => void
  imagePath: string // Needed for caching
}

const pendingRequests = new Map<string, PendingRequest>()
let samWorker: Worker | null = null

function getWorkerPath(): string {
  // In production/dev, the worker should be a sibling of index.js
  // entry 'samWorker' -> samWorker.js
  return join(__dirname, 'samWorker.js')
}

function initWorker(modelId: SamModelId): Promise<void> {
  return new Promise((resolveResult, rejectResult) => {
    if (samWorker) {
      // If worker exists, just re-init with new model?
      // Or if we want fresh worker:
      // samWorker.terminate()
      // For now, let's reuse and send 'init' message
    } else {
      const workerPath = getWorkerPath()
      if (!existsSync(workerPath)) {
        // Fallback for dev if structure is different?
        // But we configured it to be there.
        console.warn('[SAM] Worker file not found at', workerPath)
      }
      samWorker = new Worker(workerPath)

      samWorker.on('message', (msg) => {
        if (msg.type === 'init_result') {
          if (msg.success) {
            // resolve handled by specific promise?
            // We need to track who asked for init.
            // Since init is sequential globally for us:
            // We could treat it as a request.
          }
        } else if (msg.type === 'result') {
          const req = pendingRequests.get(msg.id)
          if (req) {
            pendingRequests.delete(msg.id)
            // Reconstruct tensor
            const { embedding, dims, origWidth, origHeight } = msg
            // embedding is Float32Array (transfered)
            // We need to wrap it in Ort.Tensor
            try {
              // We must interpret the data as float32
              const floatData =
                embedding instanceof Float32Array ? embedding : new Float32Array(embedding)
              // Note: Ort might need the specific float32 array instance

              // We can't verify 'Ort' here easily if not imported or used just for types
              // But samModel has 'import type * as Ort'
              // We need the Value, so we use 'ortModule' which is loaded dynamically
              if (ortModule) {
                const tensor = new ortModule.Tensor('float32', floatData, dims)

                const entry: ImageEmbeddingCacheEntry = {
                  embedding: tensor,
                  origWidth,
                  origHeight,
                  modelId: samState.currentModelId,
                  lastUsed: Date.now()
                }
                embeddingCache.set(req.imagePath, entry)
                cleanupEmbeddingCache() // Maintain LRU
                req.resolve(entry)
              } else {
                req.reject(new Error('ORT module not loaded in main thread'))
              }
            } catch (e) {
              req.reject(e as Error)
            }
          }
        } else if (msg.type === 'error') {
          const req = pendingRequests.get(msg.id)
          if (req) {
            pendingRequests.delete(msg.id)
            req.reject(new Error(msg.error))
          }
        }
      })

      samWorker.on('error', (err) => {
        console.error('[SAM-Worker] Error:', err)
      })
    }

    // Send init
    const config = SAM_MODELS[modelId]
    const dir = getModelDir(modelId)
    // We pass absolute path to encoder
    const encoderPath = join(dir, config.encoderFile)

    // We need to wait for init result.
    // Simplified: Just fire and assume success?
    // No, we should wait.
    // Hack: use a temporary listener or just trust the next 'init_result' is for us.
    // Or better, add ID to init message?
    // The worker code I wrote doesn't echo ID for init.
    // Let's rely on event based wrapper for init.

    const onInit = (msg: { type: string; success?: boolean; error?: string }): void => {
      if (msg.type === 'init_result') {
        samWorker?.off('message', onInit)
        if (msg.success) resolveResult()
        else rejectResult(new Error(msg.error))
      }
    }
    samWorker.on('message', onInit)

    samWorker.postMessage({
      type: 'init',
      config: {
        modelId,
        modelPath: encoderPath
      }
    })
  })
}

async function computeImageEmbedding(imagePath: string): Promise<ImageEmbeddingCacheEntry> {
  // Ensure worker is ready? calling ensureSamSessionLoaded handles init.
  // But ensureSamSessionLoaded calls worker init.

  if (!samWorker) {
    throw new Error('SAM worker not initialized')
  }

  // Ensure ORT is loaded for Tensor creation
  await ensureOrtLoaded()

  return new Promise((resolve, reject) => {
    const id = Date.now().toString() + Math.random().toString()
    pendingRequests.set(id, { resolve, reject, imagePath })

    samWorker?.postMessage({
      type: 'encode',
      id,
      imagePath
    })
  })
}

function transformPointsToOnnxCoords(
  points: SamPoint[],
  origWidth: number,
  origHeight: number
): Float32Array {
  const scale = getResizeScale(origWidth, origHeight)

  const n = points.length
  const total = n + 1 // padding point
  const arr = new Float32Array(total * 2)

  for (let i = 0; i < n; i++) {
    const p = points[i]
    arr[i * 2 + 0] = p.x * scale
    arr[i * 2 + 1] = p.y * scale
  }

  // Padding point (0,0)
  arr[n * 2 + 0] = 0
  arr[n * 2 + 1] = 0

  return arr
}

function buildPointLabels(numPoints: number, labels?: number[]): Float32Array {
  const total = numPoints + 1
  const arr = new Float32Array(total)
  for (let i = 0; i < numPoints; i++) {
    // If labels provided, use them. Otherwise default to 1 (foreground)
    arr[i] = labels && labels[i] !== undefined ? labels[i] : 1
  }
  arr[total - 1] = -1 // padding point label
  return arr
}

interface XY {
  x: number
  y: number
}

/**
 * Simple implementation of Moore-Neighbor Tracing for contour detection.
 * Extracts the boundary of the mask as an ordered list of points.
 */
function traceBoundary(
  maskData: Float32Array,
  maskWidth: number,
  maskHeight: number,
  scaleX: number,
  scaleY: number
): XY[] {
  const getPixel = (x: number, y: number): number => {
    if (x < 0 || x >= maskWidth || y < 0 || y >= maskHeight) return 0
    return maskData[y * maskWidth + x] > 0 ? 1 : 0
  }

  // 1. Find start
  let sx = -1,
    sy = -1
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      if (getPixel(x, y)) {
        sx = x
        sy = y
        break
      }
    }
    if (sx !== -1) break
  }
  if (sx === -1) return []

  const points: XY[] = []
  let cx = sx,
    cy = sy

  // Direction offsets: E, SE, S, SW, W, NW, N, NE (Clockwise)
  const dx = [1, 1, 0, -1, -1, -1, 0, 1]
  const dy = [0, 1, 1, 1, 0, -1, -1, -1]

  // We arrive from North (virtual), so we start looking from West?
  // (sx, sy-1) is neighbor 6 (North) relative to P
  // Search start index = 6.
  // Wait, if we use the robust rule: enteredFrom = 6 (North)
  let enteredFrom = 6

  let loops = 0
  while (true) {
    points.push({ x: cx * scaleX, y: cy * scaleY })

    let found = false
    for (let i = 0; i < 8; i++) {
      // Check neighbors clockwise starting from enteredFrom
      const nd = (enteredFrom + i) % 8
      const nx = cx + dx[nd]
      const ny = cy + dy[nd]

      if (getPixel(nx, ny)) {
        // Found next boundary pixel
        // New entering direction logic:
        // If we moved in direction 'nd', we effectively entered the new pixel from the opposite side?
        // No, Moore-Neighbor tracing rule: B = P_prev_neighbor (backtrack).
        // Here we simplify by implicitly tracking "where we came from".
        // If we move East (0), we enter from West (4).
        // Next search starts from (enteredFrom + 2) % 8 for 4-connected,
        // or just follow the crawler rule: start from (nd + 4 + 2)?
        // Let's use the proven: start from (nd + 5) % 8  (Look "Left-ish")
        const from = (nd + 4) % 8
        enteredFrom = (from + 2) % 8

        cx = nx
        cy = ny
        found = true
        break
      }
    }

    if (!found) break // Isolated pixel
    if (cx === sx && cy === sy) break // Back to start
    if (loops++ > maskWidth * maskHeight) break // Safety
  }

  return points
}

function maskToPolygon(
  maskData: Float32Array,
  maskWidth: number,
  maskHeight: number,
  origWidth: number,
  origHeight: number
): { x: number; y: number }[] {
  const scaleX = origWidth / maskWidth
  const scaleY = origHeight / maskHeight

  // Use tracing instead of scanning + convex hull
  return traceBoundary(maskData, maskWidth, maskHeight, scaleX, scaleY)
}

/**
 * Warm up GPU on app start to eliminate first-run initialization delay
 */
export async function warmupGPU(): Promise<void> {
  try {
    console.log('[SAM-GPU] Warming up GPU...')
    await ensureSamSessionLoaded()

    // Run a minimal inference to initialize GPU
    if (samDecoderSession && ortModule) {
      const ort = ortModule as typeof Ort

      // Create minimal dummy tensors
      const dummyEmbedding = new ort.Tensor(
        'float32',
        new Float32Array(256 * 64 * 64),
        [1, 256, 64, 64]
      )
      const dummyCoords = new ort.Tensor('float32', new Float32Array([512, 512, 0, 0]), [1, 2, 2])
      const dummyLabels = new ort.Tensor('float32', new Float32Array([1, -1]), [1, 2])
      const dummyMask = new ort.Tensor(
        'float32',
        new Float32Array(1 * 1 * 256 * 256),
        [1, 1, 256, 256]
      )
      const dummyHasMask = new ort.Tensor('float32', new Float32Array([0]), [1])
      const dummyOrigSize = new ort.Tensor('float32', new Float32Array([1024, 1024]), [2])

      const warmupInputs = {
        image_embeddings: dummyEmbedding,
        point_coords: dummyCoords,
        point_labels: dummyLabels,
        mask_input: dummyMask,
        has_mask_input: dummyHasMask,
        orig_im_size: dummyOrigSize
      }

      await samDecoderSession.run(warmupInputs)
      console.log('[SAM-GPU] ✓ GPU warm-up complete')
    }
  } catch (e) {
    console.warn('[SAM-GPU] Warm-up failed (not critical):', (e as Error).message)
  }
}

export async function runSamInference(
  imagePath: string,
  points: SamPoint[],
  labels?: number[]
): Promise<SamMaskResult> {
  if (points.length === 0) {
    throw new Error('At least one point is required for SAM inference.')
  }

  // Ensure session is loaded (active model)
  await ensureSamSessionLoaded()

  const ort = ortModule as typeof Ort

  let entry = embeddingCache.get(imagePath)
  // Check if cache entry exists AND belongs to the current model
  if (!entry || entry.modelId !== samState.currentModelId) {
    const embeddingStart = performance.now()
    entry = await computeImageEmbedding(imagePath)
    const embeddingTime = performance.now() - embeddingStart
    console.log(`[SAM-GPU] Image embedding computed in ${embeddingTime.toFixed(2)}ms`)
  } else {
    // Update LRU timestamp on cache hit
    entry.lastUsed = Date.now()
    embeddingCache.set(imagePath, entry)
    console.log('[SAM-GPU] Using cached image embedding')
  }

  const { embedding, origWidth, origHeight } = entry

  // samEncoderSession removed
  const decoder = samDecoderSession
  if (!decoder) {
    throw new Error('SAM decoder session is not ready.')
  }

  const coordsArr = transformPointsToOnnxCoords(points, origWidth, origHeight)
  const labelsArr = buildPointLabels(points.length, labels)

  const pointCoords = new ort.Tensor('float32', coordsArr, [1, points.length + 1, 2])
  const pointLabels = new ort.Tensor('float32', labelsArr, [1, points.length + 1])

  const maskInput = new ort.Tensor('float32', new Float32Array(1 * 1 * 256 * 256), [1, 1, 256, 256])
  const hasMaskInput = new ort.Tensor('float32', new Float32Array([0]), [1])

  const origSize = new ort.Tensor('float32', new Float32Array([origHeight, origWidth]), [2])

  const decoderInputs: Record<string, Ort.Tensor> = {
    image_embeddings: embedding as Ort.Tensor,
    point_coords: pointCoords,
    point_labels: pointLabels,
    mask_input: maskInput,
    has_mask_input: hasMaskInput,
    orig_im_size: origSize
  }

  // Measure decoder inference time (where GPU makes the biggest difference)
  const inferenceStart = performance.now()
  const outputs = await decoder.run(decoderInputs)
  const inferenceTime = performance.now() - inferenceStart
  console.log(
    `[SAM-GPU] Decoder inference completed in ${inferenceTime.toFixed(2)}ms (Provider: ${samState.gpuInfo?.provider || 'unknown'})`
  )

  const firstOutputName = decoder.outputNames[0]
  const masksTensor = outputs[firstOutputName] as Ort.Tensor

  const data = masksTensor.data as Float32Array | number[]
  const floatData = data instanceof Float32Array ? data : new Float32Array(data)

  const shape = masksTensor.dims
  const h = shape[shape.length - 2]
  const w = shape[shape.length - 1]

  const polygon = maskToPolygon(floatData, w, h, origWidth, origHeight)

  return { points: polygon }
}
