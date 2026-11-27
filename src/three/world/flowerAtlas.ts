import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const ATLAS_WIDTH = 512
export const ATLAS_HEIGHT = 1024

export type AtlasRect = { x: number; y: number; w: number; h: number }

export const ATLAS = {
    bloom: { x: 0, y: 0, w: 180, h: 180 },
    bloom2: { x: 0, y: 180, w: 180, h: 180 },
    stem:  { x: 200, y: 0, w: 300, h: 860 }
} satisfies Record<string, AtlasRect>

// height = výška plochy ve světě (třeba 1.5)
export function createPartGeometry(rect: AtlasRect, height: number) {
    const width = height * (rect.w / rect.h)
    const geometry = new THREE.PlaneGeometry(width, height)

    const uMin = rect.x / ATLAS_WIDTH
    const uMax = (rect.x + rect.w) / ATLAS_WIDTH
    const vMin = 1 - (rect.y + rect.h) / ATLAS_HEIGHT
    const vMax = 1 - rect.y / ATLAS_HEIGHT

    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i) // 0 nebo 1
        const v = uv.getY(i) // 0 nebo 1
      
        uv.setXY(i, uMin + u * (uMax - uMin), vMin + v * (vMax - vMin))
    }

    geometry.translate(0, height / 2, 0)

    return geometry
}

export function createCrossGeometry(rect: AtlasRect, height: number, count = 2) {
  const base = createPartGeometry(rect, height)
  const parts: THREE.BufferGeometry[] = []

  const angle = Math.PI / count

  for (let i = 0; i < count; i++) {
    const baseClone = base.clone()
    baseClone.rotateY(i * angle)
    parts.push(baseClone)
  }

  return mergeGeometries(parts)!
}

// bloomRect = který květ z atlasu použít → každý druh kytky si zavolá s jiným
export function createFlowerGeometry(height: number, bloomRect: AtlasRect, count = 2) {
    const bloomHeight = height * 0.2

    const stem = createCrossGeometry(ATLAS.stem, height, count)
    const bloom = createPartGeometry(bloomRect, bloomHeight)

    bloom.translate(0, -bloomHeight / 2, 0)
    bloom.rotateX(-Math.PI / 3)
    bloom.translate(0, height * 0.97, 0)

    return mergeGeometries([stem, bloom])!
}