import * as THREE from 'three'
import { createFlowerGeometry } from './flowerAtlas'
import { HILL_RADIUS, getHillHeight } from './Hill'

export class FlowerField {
  mesh: THREE.InstancedMesh

  constructor(count: number) {
    const flowerSize = 2

    const textureLoader = new THREE.TextureLoader()

    const flowerTexture = textureLoader.load('/textures/flowers/Chamomile_1K_albedo.png')
    const flowerAlpha = textureLoader.load('/textures/flowers/Chamomile_1K_alpha.png')

    flowerTexture.colorSpace = THREE.SRGBColorSpace

    const flowerMaterial = new THREE.MeshBasicMaterial({ 
        map: flowerTexture,
        alphaMap: flowerAlpha,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
    })

    const geometry = createFlowerGeometry(flowerSize)

    // ── InstancedMesh místo Mesh ──
    this.mesh = new THREE.InstancedMesh(geometry, flowerMaterial, count)

    // ── Pomocné objekty: vytvořit JEDNOU, v cyklu jen přepisovat ──
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const upAxis = new THREE.Vector3(0, 1, 0)

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2

        const r = HILL_RADIUS * 0.9 * Math.sqrt(Math.random())
        const x = r * Math.cos(angle)
        const z = r * Math.sin(angle)

        position.set(x, getHillHeight(x, z), z)

        quaternion.setFromAxisAngle(upAxis, Math.random() * Math.PI * 2)

        const s = THREE.MathUtils.randFloat(0.7, 1.3)
        scale.set(s, s, s)

        matrix.compose(position, quaternion, scale)
        this.mesh.setMatrixAt(i, matrix)
    }

    this.mesh.instanceMatrix.needsUpdate = true
  }
}