import * as THREE from 'three'

export const HILL_RADIUS = 18   // vodorovný poloměr
export const HILL_HEIGHT = 4.5  // výška vršku
export const HILL_Y = -2              // posun dolů

export class Hill {
  mesh: THREE.Mesh

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 96, 48)
    geometry.scale(HILL_RADIUS, HILL_HEIGHT, HILL_RADIUS) // zploštit do kopečku

    const top = new THREE.Color('#D6EEFA')
    const bottom = new THREE.Color('#EEFAFF')

    const pos = geometry.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const t = THREE.MathUtils.smoothstep(y, -1, 4.5)
      c.lerpColors(bottom, top, t)
      c.toArray(colors, i * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.MeshBasicMaterial({ vertexColors: true })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.y = HILL_Y
  }
}

export function getHillHeight(x: number, z: number): number {
  // y = HILL_HEIGHT * √(1 − (x² + z²) / HILL_RADIUS²) + HILL_Y
  const r2 = x * x + z * z
  if (r2 > HILL_RADIUS * HILL_RADIUS) return HILL_Y
  const y = HILL_HEIGHT * Math.sqrt(1 - r2 / (HILL_RADIUS * HILL_RADIUS)) + HILL_Y
  return y
}