import { parentPort, workerData } from 'worker_threads'
import { join } from 'path'
import Jimp from 'jimp'
import * as Ort from 'onnxruntime-node'

// Types (mirrored from samModel.ts to avoid circular dep issues during build if not careful, 
// strictly we could import types if we export them properly)
export type SamModelId = 'vit_b' | 'vit_l' | 'vit_h'

interface WorkerConfig {
  modelId: SamModelId
  modelPath: string // Absolute path to encoder.onnx
  threads?: number
}

interface ComputeRequest {
  id: string
  imagePath: string
  modelId: SamModelId // verification
}

// State
let session: Ort.InferenceSession | null = null
let currentModelId: SamModelId | null = null

const SAM_IMAGE_SIZE = 1024

function getResizeScale(width: number, height: number): number {
  const longSide = Math.max(width, height)
  return SAM_IMAGE_SIZE / longSide
}

async function loadSession(config: WorkerConfig) {
  try {
    if (session && currentModelId === config.modelId) {
       return // Already loaded
    }
    
    // Release old
    if (session) {
      try { (session as any).release() } catch(e) {}
      session = null
    }

    console.log(`[SAM-Worker] Loading encoder model: ${config.modelId} from ${config.modelPath}`)
    
    // Encoder is always CPU or standard default?
    // Actually, for prefetching background, CPU is safer to avoid fighting for GPU with decoder.
    // BUT the user wants speed.
    // If we use GPU in worker, we might have concurrency issues with Main thread Decoder using GPU.
    // However, ONNX Runtime is generally thread-safe-ish, but multiple sessions on same GPU might be tricky if VRAM is low.
    // Let's stick to standard CPU for Encoder for now OR use same settings as Main.
    // Given the "kasma" (lag) is the main concern, moving to worker frees the UI.
    // Using CPU for encoder in worker is "safe". Using GPU is "fast". 
    // Let's try to just use default (likely CPU) first, or configurable.
    
    const sessionOptions: any = {
      executionProviders: ['cpu'], // Safe default for background worker
      executionMode: 'sequential',
      enableCpuMemArena: true,
      enableMemPattern: true,
      logSeverityLevel: 2
    }

    session = await Ort.InferenceSession.create(config.modelPath, sessionOptions)
    currentModelId = config.modelId
    console.log(`[SAM-Worker] Encoder loaded successfully`)
    
    parentPort?.postMessage({ type: 'init_result', success: true })
  } catch (e) {
    console.error(`[SAM-Worker] Failed to load session`, e)
    parentPort?.postMessage({ type: 'init_result', success: false, error: (e as Error).message })
  }
}

async function computeEmbedding(videoPath: string, reqId: string) {
  if (!session) {
      parentPort?.postMessage({ type: 'error', id: reqId, error: 'Session not initialized' })
      return
  }

  try {
      const img = await Jimp.read(videoPath)
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

      // This loop is what blocks the main thread!
      canvas.scan(0, 0, SAM_IMAGE_SIZE, SAM_IMAGE_SIZE, (x, y, idx) => {
          const r = canvas.bitmap.data[idx + 0]
          const g = canvas.bitmap.data[idx + 1]
          const b = canvas.bitmap.data[idx + 2]

          chw[idxR++] = (r - mean[0]) / std[0]
          chw[idxG++] = (g - mean[1]) / std[1]
          chw[idxB++] = (b - mean[2]) / std[2]
      })

      const inputName = session.inputNames[0]
      const input = new Ort.Tensor('float32', chw, [1, 3, SAM_IMAGE_SIZE, SAM_IMAGE_SIZE])
      const outputs = await session.run({ [inputName]: input })

      const firstOutputName = session.outputNames[0]
      const embedding = outputs[firstOutputName]

      // We need to detach the data to send it back efficienty
      // embedding.data is Float32Array
      
      parentPort?.postMessage({ 
          type: 'result', 
          id: reqId,
          embedding: embedding.data,
          dims: embedding.dims,
          origWidth,
          origHeight
      }, [ (embedding.data as any).buffer ]) 

  } catch (e) {
      console.error(`[SAM-Worker] Error computing embedding`, e)
      parentPort?.postMessage({ type: 'error', id: reqId, error: (e as Error).message })
  }
}

if (!parentPort) {
    throw new Error('Must be run as a worker thread')
}

parentPort.on('message', async (msg) => {
    if (msg.type === 'init') {
        await loadSession(msg.config)
    } else if (msg.type === 'encode') {
        await computeEmbedding(msg.imagePath, msg.id)
    }
})
