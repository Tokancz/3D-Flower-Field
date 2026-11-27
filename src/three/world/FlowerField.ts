import * as THREE from 'three'
import { ATLAS, createFlowerGeometry } from './flowerAtlas'
import { HILL_RADIUS, getHillHeight } from './Hill'
import vertexShader from '../shaders/flower.vert.glsl?raw'
import fragmentShader from '../shaders/flower.frag.glsl?raw'
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js'

export class FlowerField {
    // Group = "složka" ve scéně, Experience přidá jen ji a nemusí vědět, kolik druhů máme
    group = new THREE.Group()
    private meshes: THREE.InstancedMesh[]
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

        // ── Druhy kytek: stejný stonek, jiný květ ──
        // Každý druh = vlastní geometrie = vlastní InstancedMesh. Materiál sdílí všechny.
        const types = [ATLAS.bloom, ATLAS.bloom2]

        // Každý mesh vytvoříme s kapacitou `count` (víc se do něj nevejde),
        // ale skutečný počet nastavíme až po rozdělení přes mesh.count.
        this.meshes = types.map((bloomRect) => {
            const geometry = createFlowerGeometry(flowerSize, bloomRect)
            const mesh = new THREE.InstancedMesh(geometry, this.material, count)
            mesh.count = 0 // zatím prázdný, budeme přičítat
            this.group.add(mesh)
            return mesh
        })

        // ── Pomocné objekty: vytvořit JEDNOU, v cyklu jen přepisovat ──
        const matrix = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        const upAxis = new THREE.Vector3(0, 1, 0)
        const noise = new SimplexNoise()
        const petalColor = new THREE.Color()

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2

            const r = HILL_RADIUS * 0.9 * Math.sqrt(Math.random())
            const x = r * Math.cos(angle)
            const z = r * Math.sin(angle)

            // ── 1) Spherical gradient: 1 uprostřed → 0 na okraji kopce ──
            const center = 1 - r / HILL_RADIUS
            // "ColorRamp": střed zůstane plný (1), zmenšovat začne až u okraje
            const edgeFalloff = THREE.MathUtils.smoothstep(center, 0.0, 0.45)

            // ── 2) Noise pro clustery velikosti ──
            // freq: menší = větší skvrny. Kopec má poloměr 18 → 0.18 dá pár výrazných skvrn
            const rawSize = noise.noise(x * 0.18, z * 0.18) * 0.5 + 0.5
            // "ColorRamp" na noise: roztáhne kontrast, ať jsou clustery vidět
            const sizeNoise = THREE.MathUtils.smoothstep(rawSize, 0.2, 0.7)

            position.set(x, getHillHeight(x, z), z)

            quaternion.setFromAxisAngle(upAxis, Math.random() * Math.PI * 2)

            // ── 3) Kombinace: noise určí velikost v clusteru, gradient ji u kraje stáhne ──
            const clusterScale = THREE.MathUtils.lerp(0.8, 1.2, sizeNoise)
            const edgeScale = THREE.MathUtils.lerp(0.7, 1.0, edgeFalloff)
            const jitter = THREE.MathUtils.randFloat(0.9, 1.1) // drobná náhoda, ať to není "moc čisté"
            const s = clusterScale * edgeScale * jitter
            scale.set(s, s, s)

            matrix.compose(position, quaternion, scale)

            // ── 5) Třetí noise: který druh kytky tu roste? ──
            // Trochu náhody navíc → na hranici clusterů se druhy promíchají, není tam ostrá čára
            const typeNoise = noise.noise(x * 0.1 + 200, z * 0.1 + 200) * 0.5 + 0.5
            const typeIndex = typeNoise + THREE.MathUtils.randFloat(-0.15, 0.15) > 0.5 ? 1 : 0

            const mesh = this.meshes[typeIndex]!
            const slot = mesh.count++ // vezmi další volné místo v tomhle meshi
            mesh.setMatrixAt(slot, matrix)

            // ── 4) Druhý noise pro barvu: jiná frekvence + posun (+100) = jiný vzor ──
            const rawColor = noise.noise(x * 0.12 + 100, z * 0.12 + 100) * 0.5 + 0.5
            const colorNoise = THREE.MathUtils.smoothstep(rawColor, 0.25, 0.75)
            petalColor.setHSL(
                THREE.MathUtils.lerp(0.58, 0.63, colorNoise), // odstín: tyrkysová ↔ modrá
                0.8,                                          // sytost
                THREE.MathUtils.lerp(0.5, 0.62, colorNoise),  // jas
            )
            mesh.setColorAt(slot, petalColor)
        }

        for (const mesh of this.meshes) {
            mesh.instanceMatrix.needsUpdate = true
            mesh.instanceColor!.needsUpdate = true
        }
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