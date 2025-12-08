// src/utils/dom.ts

// SVG element üretimi için namespace
export const SVG_NS = 'http://www.w3.org/2000/svg'

// querySelectorAll için kök tip
export type QueryRoot = Document | Element | DocumentFragment

// Type-safe querySelectorAll helper
export function qsa<T extends Element = Element>(root: QueryRoot, sel: string): T[] {
  return Array.from(root.querySelectorAll(sel)) as T[]
}
