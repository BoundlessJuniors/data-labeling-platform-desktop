import { app, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import Jimp from 'jimp'

// Tip import'u için dinamik import kullanacağız; böylece uygulama açılırken
// native modül hemen yüklenmek zorunda kalmaz.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type * as Ort from 'onnxruntime-node'

export type SamStatus = 'idle' | 'downloading' | 'ready' | 'error'

export interface SamState {
  status: SamStatus
  error: string | null
}

const SAM_ENCODER_FILE = 'encoder-quant.onnx'
const SAM_DECODER_FILE = 'decoder-quant.onnx'

// Hugging Face'teki SAM ViT-B ONNX encoder & decoder (quantize) dosyaları.
const SAM_ENCODER_URL =
  'https://huggingface.co/visheratin/segment-anything-vit-b/resolve/main/encoder-quant.onnx'
const SAM_DECODER_URL =
  'https://huggingface.co/visheratin/segment-anything-vit-b/resolve/main/decoder-quant.onnx'

let ortModule: typeof Ort | null = null
let samEncoderSession: Ort.InferenceSession | null = null
let samDecoderSession: Ort.InferenceSession | null = null

const samState: SamState = {
  status: 'idle',
  error: null
}

export interface SamDownloadProgress {
  stage: 'encoder' | 'decoder'
  loaded: number
  total: number | null
}

function getModelsDir(): string {
  const userData = app.getPath('userData')
  const dir = join(userData, 'models', 'sam')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getSamModelPath(): string {
  // Varsayılan olarak decoder yolunu döndür (hata mesajlarında kullanılmak üzere).
  return join(getModelsDir(), SAM_DECODER_FILE)
}

export function getSamState(): SamState {
  return { ...samState }
}

export async function isSamModelDownloaded(): Promise<boolean> {
  const dir = getModelsDir()
  return existsSync(join(dir, SAM_ENCODER_FILE)) && existsSync(join(dir, SAM_DECODER_FILE))
}

export async function downloadSamModel(onProgress?: (p: SamDownloadProgress) => void): Promise<void> {
  if (samState.status === 'downloading') return

  samState.status = 'downloading'
  samState.error = null

  try {
    const dir = getModelsDir()

    const downloadOne = async (
      url: string,
      file: string,
      stage: SamDownloadProgress['stage']
    ): Promise<void> => {
      const res = await net.fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
      }

      const totalHeader = res.headers.get('content-length')
      const total = totalHeader ? Number.parseInt(totalHeader, 10) || null : null

      const targetPath = join(dir, file)
      const fileStream = createWriteStream(targetPath)

      const body = res.body
      if (!body) {
        // Fallback: body stream yoksa tek seferde indir.
        const arrayBuffer = await res.arrayBuffer()
        fileStream.write(Buffer.from(arrayBuffer))
        fileStream.end()
        onProgress?.({ stage, loaded: total ?? 1, total })
        return
      }

      const reader = body.getReader()
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          loaded += value.byteLength
          fileStream.write(Buffer.from(value))
          onProgress?.({ stage, loaded, total })
        }
      }

      fileStream.end()
    }

    await downloadOne(SAM_ENCODER_URL, SAM_ENCODER_FILE, 'encoder')
    await downloadOne(SAM_DECODER_URL, SAM_DECODER_FILE, 'decoder')

    samState.status = 'idle'
  } catch (err) {
    console.error('[SAM] model download failed:', err)
    samState.status = 'error'
    samState.error = err instanceof Error ? err.message : String(err)
    throw err
  }
}

async function ensureOrtLoaded(): Promise<typeof Ort> {
  if (ortModule) return ortModule
  // Dinamik import: build sırasında tree-shaking ile uyumlu, açılışta gecikme yaratmaz.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = (await import('onnxruntime-node')) as typeof Ort
  ortModule = mod
  return mod
}

export async function ensureSamSessionLoaded(): Promise<void> {
  if (samEncoderSession && samDecoderSession) return

  const hasModel = await isSamModelDownloaded()
  if (!hasModel) {
    throw new Error('SAM model file not found. Please download it first.')
  }

  const ort = await ensureOrtLoaded()
  const dir = getModelsDir()
  const encoderPath = join(dir, SAM_ENCODER_FILE)
  const decoderPath = join(dir, SAM_DECODER_FILE)

  samEncoderSession = await ort.InferenceSession.create(encoderPath)
  samDecoderSession = await ort.InferenceSession.create(decoderPath)
  samState.status = 'ready'
}

export interface SamPoint {
  x: number
  y: number
}

export interface SamMaskResult {
  // SAM çıktısından üretilen polygon maske sonucu.
  points: { x: number; y: number }[]
}

const SAM_IMAGE_SIZE = 1024

interface ImageEmbeddingCacheEntry {
  embedding: Ort.Tensor
  origWidth: number
  origHeight: number
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

  // SAM, en uzun kenarı 1024 olacak şekilde resmi ölçekliyor.
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
    origHeight
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
    labels[i] = 1 // tüm noktalar pozitif kabul ediliyor
  }
  labels[total - 1] = -1 // padding point label
  return labels
}

interface XY {
  x: number
  y: number
}

function convexHull(points: XY[]): XY[] {
  if (points.length <= 1) return points

  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  const cross = (o: XY, a: XY, b: XY): number => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  }

  const lower: XY[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: XY[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

function maskToPolygon(
  maskData: Float32Array,
  maskWidth: number,
  maskHeight: number,
  origWidth: number,
  origHeight: number
): { x: number; y: number }[] {
  const points: XY[] = []

  const scaleX = origWidth / maskWidth
  const scaleY = origHeight / maskHeight

  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      const v = maskData[y * maskWidth + x]
      if (v <= 0) continue

      points.push({ x: x * scaleX, y: y * scaleY })
    }
  }

  if (points.length === 0) {
    return []
  }

  return convexHull(points)
}

export async function runSamInference(
  imagePath: string,
  points: SamPoint[]
): Promise<SamMaskResult> {
  if (points.length === 0) {
    throw new Error('At least one point is required for SAM inference.')
  }
  await ensureSamSessionLoaded()

  const ort = ortModule as typeof Ort

  let entry = embeddingCache.get(imagePath)
  if (!entry) {
    entry = await computeImageEmbedding(imagePath)
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

  const outputs = await samDecoderSession.run(decoderInputs)
  const firstOutputName = samDecoderSession.outputNames[0]
  const masksTensor = outputs[firstOutputName] as Ort.Tensor

  const data = masksTensor.data as Float32Array | number[]
  const floatData = data instanceof Float32Array ? data : new Float32Array(data)

  // Çoğu SAM decoder çıktısı [1, 1, H, W] şeklindedir.
  const shape = masksTensor.dims
  const h = shape[shape.length - 2]
  const w = shape[shape.length - 1]

  const polygon = maskToPolygon(floatData, w, h, origWidth, origHeight)

  return { points: polygon }
}
