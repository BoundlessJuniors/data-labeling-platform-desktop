// src/renderer/src/theme/annotationPalette.ts
// Merkezi annotation stili (UI/Tailwind'den bağımsız)
// Tek noktadan kontrol: renk, kalınlık, dolgu opaklığı.

import type { Annotation } from '@renderer/types/annotation'

export type AnnotationType = Annotation['type']

// Tek renk isteniyor: Orange
export const ANNOTATION_COLOR = '#F97316' // orange-500

export function getAnnotationSvgStyle(type: AnnotationType): {
  stroke: string
  strokeWidth: number
  fill: string
  fillOpacity: number
} {
  // İsterseniz ileride type'a göre farklılaştırılır.
  // Şimdilik tüm shape'ler tek renk.
  const base = {
    stroke: ANNOTATION_COLOR,
    strokeWidth: 2,
    fill: ANNOTATION_COLOR,
    fillOpacity: 0.12
  }

  // Çizgisel objelerde dolgu olmasın
  if (type === 'polyline') {
    return { ...base, fillOpacity: 0 }
  }

  // Nokta (keypoint) daha belirgin olsun
  if (type === 'keypoint') {
    return { ...base, fillOpacity: 0.9 }
  }

  return base
}
