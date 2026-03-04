import { createHash } from 'crypto'

/**
 * Deterministic JSON serialization with sorted keys.
 * Two logically identical objects always produce the same string.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj)
  if (typeof obj !== 'object') return JSON.stringify(obj)

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => stableStringify(item)).join(',') + ']'
  }

  const sorted = Object.keys(obj as Record<string, unknown>).sort()
  const parts = sorted.map((key) => {
    const val = (obj as Record<string, unknown>)[key]
    return JSON.stringify(key) + ':' + stableStringify(val)
  })
  return '{' + parts.join(',') + '}'
}

/**
 * Compute SHA-256 hex hash of a payload_json string using canonical form.
 */
export function computePayloadHash(payloadJson: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(payloadJson)
  } catch {
    // If it can't be parsed, hash the raw string
    parsed = payloadJson
  }
  const canonical = stableStringify(parsed)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}
