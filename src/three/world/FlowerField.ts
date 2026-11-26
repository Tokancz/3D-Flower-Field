import * as THREE from 'three'
import { createFlowerGeometry } from './flowerAtlas'
import { HILL_RADIUS, getHillHeight } from './Hill'
import vertexShader from '../shaders/flower.vert.glsl?raw'
import fragmentShader from '../shaders/flower.frag.glsl?raw'

export class FlowerField {
    mesh: THREE.InstancedMesh
    private material: THREE.ShaderMaterial
    private mouseTarget = new THREE.Vector3()
    private mouseTargetStrength = 0

    constructor(count: number = 1000, fog: THREE.Fog) {
        const flowerSize = 2

        const textureLoader = new THREE.TextureLoader()

        const flowerTexture = textureLoader.load('/textures/flowers/Chamomile_1K_albedo.png')
        const flowerAlpha = textureLoader.load('/textures/flowers/Chamomile_1K_alpha.png')

        flowerTexture.colorSpace = THREE.SRGBColorSpace

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            uniforms: {
                uMap: { value: flowerTexture },
                uAlphaMap: { value: flowerAlpha },
                uFogColor: { value: fog.color },
                uFogNear: { value: fog.near },
                uFogFar: { value: fog.far },
                uTime: { value: 0 },
                uFlowerHeight: { value: flowerSize },
                uPetalColor: { value: new THREE.Color('#4dacff') },
                uMouse: { value: new THREE.Vector3() },
                uMouseRadius: { value: 4.0 },
                uMouseStrength: { value: 0 },
            },
        })

        const geometry = createFlowerGeometry(flowerSize)

        // ── InstancedMesh místo Mesh ──
        this.mesh = new THREE.InstancedMesh(geometry, this.material, count)

        // ── Pomocné objekty: vytvořit JEDNOU, v cyklu jen přepisovat ──
        const matrix = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        const upAxis = new THREE.Vector3(0, 1, 0)
        const petalColor = new THREE.Color()

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
            // Odstín kolem modré (0.58 = modrá na barevném kole 0–1), trochu jiný jas
            const petalColor = new THREE.Color()
            petalColor.setHSL(
                THREE.MathUtils.randFloat(0.55, 0.62), // odstín: tyrkysová ↔ modrá
                0.8,                                   // sytost
                THREE.MathUtils.randFloat(0.5, 0.6),   // jas
            )
            this.mesh.setColorAt(i, petalColor)
        }
        
        this.mesh.instanceColor!.needsUpdate = true
        this.mesh.instanceMatrix.needsUpdate = true
    }

    // Experience sem pošle bod na kopci, nebo null, když myš není nad kopcem
    setMouse(point: THREE.Vector3 | null, speed: number) {
        if (point) {
            this.mouseTarget.copy(point)
            // Rychlost → síla 0–1. Při ~1 šířce obrazovky za sekundu je síla plná.
            this.mouseTargetStrength = Math.min(speed * 1.0, 1)
        } else {
            this.mouseTargetStrength = 0
        }
    }

    update(elapsedTime: number, delta: number) {
        const u = this.material.uniforms
        u.uTime!.value = elapsedTime

        // Plynulé dotahování (chill): každý snímek ujdi kus cesty k cíli
        const smooth = 1 - Math.exp(-delta * 8)

        // Pozice myši v shaderu "dojíždí" za skutečnou → kytky se nerozhrnou trhaně
        u.uMouse!.value.lerp(this.mouseTarget, smooth)

        // Najíždí rychle (reaguje hned), dojíždí pomalu (kytky se chvíli doklepávají)
        const current = u.uMouseStrength!.value
        const rate = this.mouseTargetStrength > current ? 12 : 2
        u.uMouseStrength!.value += (this.mouseTargetStrength - current) * (1 - Math.exp(-delta * rate))
    }
}