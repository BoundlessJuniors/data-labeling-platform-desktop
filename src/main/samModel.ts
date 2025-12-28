import { app, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import Jimp from 'jimp'

// Tip import'u için dinamik import kullanacağız; böylece uygulama açılırken
// native modül hemen yüklenmek zorunda kalmaz.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
    encoderUrl: 'https://huggingface.co/visheratin/segment-anything-vit-b/resolve/main/encoder-quant.onnx',
    decoderUrl: 'https://huggingface.co/visheratin/segment-anything-vit-b/resolve/main/decoder-quant.onnx',
    encoderFile: 'encoder-quant.onnx',
    decoderFile: 'decoder-quant.onnx',
    quantized: true
  },
  vit_l: {
    id: 'vit_l',
    name: 'Balanced (ViT-L)',
    description: 'Better accuracy, moderate speed. Recommended for complex images.',
    size: '~350 MB',
    encoderUrl: 'https://huggingface.co/visheratin/segment-anything-vit-l/resolve/main/encoder-quant.onnx',
    decoderUrl: 'https://huggingface.co/visheratin/segment-anything-vit-l/resolve/main/decoder-quant.onnx',
    encoderFile: 'encoder-quant.onnx',
    decoderFile: 'decoder-quant.onnx',
    quantized: true
  },
  vit_h: {
    id: 'vit_h',
    name: 'High Quality (ViT-H)',
    description: 'Best accuracy, slowest speed. High memory usage.',
    size: '~700 MB',
    encoderUrl: 'https://huggingface.co/visheratin/segment-anything-vit-h/resolve/main/encoder-quant.onnx',
    decoderUrl: 'https://huggingface.co/visheratin/segment-anything-vit-h/resolve/main/decoder-quant.onnx',
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
  options?: Record<string, any>
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
let samEncoderSession: Ort.InferenceSession | null = null
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
    const exists = existsSync(join(dir, config.encoderFile)) && existsSync(join(dir, config.decoderFile))
    
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
        console.error("Error cleaning up cancelled download:", e)
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
        throw new Error("No response body")
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
    const isAborted = (err as any).name === 'AbortError' || controller.signal.aborted
    
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
  if (samEncoderSession) {
    try { (samEncoderSession as any).release() } catch (e) { /* ignore */ }
    samEncoderSession = null
  }
  if (samDecoderSession) {
    try { (samDecoderSession as any).release() } catch (e) { /* ignore */ }
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = (await import('onnxruntime-node')) as typeof Ort
  ortModule = mod
  return mod
}

/**
 * GPU Provider Detection and Configuration
 */

function getCudaOptions(): Record<string, any> {
  return {
    deviceId: 0,
    cudnnConvAlgoSearch: 'DEFAULT',
    cudnnConvUseMaxWorkspace: true,
    enableCudaGraph: true,
    cudaMallocBehavior: 0
  }
}

function getDirectMLOptions(): Record<string, any> {
  return {
    deviceId: 0,
    enableGraphCapture: true
  }
}

function getCoreMLOptions(): Record<string, any> {
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
        priority: 1,
        options: getCudaOptions()
      })
      console.log('[SAM-GPU] CUDA provider added to candidate list')
    } catch (e) {
      console.log('[SAM-GPU] CUDA provider not available:', (e as Error).message)
    }
  }

  // DirectML - Available on Windows 10+ with any GPU
  if (platform === 'win32') {
    try {
      providers.push({
        name: 'directml',
        available: true,
        priority: 2,
        options: getDirectMLOptions()
      })
      console.log('[SAM-GPU] DirectML provider added to candidate list')
    } catch (e) {
      console.log('[SAM-GPU] DirectML provider not available:', (e as Error).message)
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

function buildSessionOptions(providers: ProviderInfo[], useDirectML: boolean): any {
  const executionProviders = providers
    .filter(p => p.available)
    .map(p => {
      if (p.options && Object.keys(p.options).length > 0) {
        return { name: p.name, ...p.options }
      }
      return p.name
    })

  const sessionOptions: any = {
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
  if (samEncoderSession && samDecoderSession) return

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
    
    const encoderPath = join(dir, config.encoderFile)
    const decoderPath = join(dir, config.decoderFile)
    
    // Detect available GPU providers
    const providers = await detectAvailableProviders()
    const availableProviderNames = providers.map(p => p.name)
    
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
        
        // Create encoder session
        samEncoderSession = await ort.InferenceSession.create(encoderPath, sessionOptions)
        
        // Create decoder session
        samDecoderSession = await ort.InferenceSession.create(decoderPath, sessionOptions)
        
        // Log actual providers used
        console.log('[SAM-GPU] Encoder session providers:', (samEncoderSession as any).executionProviders || provider.name)
        console.log('[SAM-GPU] Decoder session providers:', (samDecoderSession as any).executionProviders || provider.name)
        console.log(`[SAM-GPU] ✓ Successfully loaded sessions with provider: ${provider.name}`)
        
        activeProvider = provider.name
        sessionCreated = true
        break
        
      } catch (error) {
        // Clean up any partially created sessions
        if (samEncoderSession) {
          try { (samEncoderSession as any).release?.() } catch (e) { /* ignore */ }
          samEncoderSession = null
        }
        if (samDecoderSession) {
          try { (samDecoderSession as any).release?.() } catch (e) { /* ignore */ }
          samDecoderSession = null
        }
        
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.warn(`[SAM-GPU] Failed to load with ${provider.name}: ${errorMsg}`)
        
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
  modelId: SamModelId // Ensure cache is valid for current model
}

const embeddingCache = new Map<string, ImageEmbeddingCacheEntry>()

function getResizeScale(width: number, height: number): number {
  const longSide = Math.max(width, height)
  return SAM_IMAGE_SIZE / longSide
}

async function computeImageEmbedding(imagePath: string): Promise<ImageEmbeddingCacheEntry> {
  if (!samEncoderSession || !ortModule) {
    throw new Error('SAM encoder session is not ready.')
  }

  const img = await Jimp.read(imagePath)
  const origWidth = img.getWidth()
  const origHeight = img.getHeight()

  const scale = getResizeScale(origWidth, origHeight)
  const resizedW = Math.round(origWidth * scale)
  const resizedH = Math.round(origHeight * scale)

  img.resize(resizedW, resizedH)

  const canvas = new Jimp(SAM_IMAGE_SIZE, SAM_IMAGE_SIZE, 0)
  canvas.composite(img, 0, 0)

  const mean = [123.675, 116.28, 103.53]
  const std = [58.395, 57.12, 57.375]

  const chw = new Float32Array(3 * SAM_IMAGE_SIZE * SAM_IMAGE_SIZE)

  let idxR = 0
  let idxG = SAM_IMAGE_SIZE * SAM_IMAGE_SIZE
  let idxB = 2 * SAM_IMAGE_SIZE * SAM_IMAGE_SIZE

  for (let y = 0; y < SAM_IMAGE_SIZE; y++) {
    for (let x = 0; x < SAM_IMAGE_SIZE; x++) {
      const { r, g, b } = Jimp.intToRGBA(canvas.getPixelColor(x, y))

      chw[idxR++] = (r - mean[0]) / std[0]
      chw[idxG++] = (g - mean[1]) / std[1]
      chw[idxB++] = (b - mean[2]) / std[2]
    }
  }

  const inputName = samEncoderSession.inputNames[0]
  const ort = ortModule as typeof Ort
  const input = new ort.Tensor('float32', chw, [1, 3, SAM_IMAGE_SIZE, SAM_IMAGE_SIZE])
  const outputs = await samEncoderSession.run({ [inputName]: input })

  const firstOutputName = samEncoderSession.outputNames[0]
  const embedding = outputs[firstOutputName] as Ort.Tensor

  const entry: ImageEmbeddingCacheEntry = {
    embedding,
    origWidth,
    origHeight,
    modelId: samState.currentModelId
  }

  embeddingCache.set(imagePath, entry)
  return entry
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

function buildPointLabels(numPoints: number): Float32Array {
  const total = numPoints + 1
  const labels = new Float32Array(total)
  for (let i = 0; i < numPoints; i++) {
    labels[i] = 1 // all points positive
  }
  labels[total - 1] = -1 // padding point label
  return labels
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
    const getPixel = (x: number, y: number) => {
        if (x < 0 || x >= maskWidth || y < 0 || y >= maskHeight) return 0
        return maskData[y * maskWidth + x] > 0 ? 1 : 0
    }

    // 1. Find start
    let sx = -1, sy = -1
    for (let y = 0; y < maskHeight; y++) {
        for (let x = 0; x < maskWidth; x++) {
            if (getPixel(x, y)) {
                sx = x; sy = y; break;
            }
        }
        if (sx !== -1) break
    }
    if (sx === -1) return []

    const points: XY[] = []
    let cx = sx, cy = sy
    
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

export async function runSamInference(
  imagePath: string,
  points: SamPoint[]
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
    console.log('[SAM-GPU] Using cached image embedding')
  }

  const { embedding, origWidth, origHeight } = entry

  if (!samDecoderSession) {
    throw new Error('SAM decoder session is not ready.')
  }

  const coordsArr = transformPointsToOnnxCoords(points, origWidth, origHeight)
  const labelsArr = buildPointLabels(points.length)

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
  const outputs = await samDecoderSession.run(decoderInputs)
  const inferenceTime = performance.now() - inferenceStart
  console.log(`[SAM-GPU] Decoder inference completed in ${inferenceTime.toFixed(2)}ms (Provider: ${samState.gpuInfo?.provider || 'unknown'})`)
  
  const firstOutputName = samDecoderSession.outputNames[0]
  const masksTensor = outputs[firstOutputName] as Ort.Tensor

  const data = masksTensor.data as Float32Array | number[]
  const floatData = data instanceof Float32Array ? data : new Float32Array(data)

  const shape = masksTensor.dims
  const h = shape[shape.length - 2]
  const w = shape[shape.length - 1]

  const polygon = maskToPolygon(floatData, w, h, origWidth, origHeight)

  return { points: polygon }
}
