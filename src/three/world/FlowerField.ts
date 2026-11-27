import * as THREE from 'three'
import type GUI from 'lil-gui'
import { ATLAS, createFlowerGeometry } from './flowerAtlas'
import { HILL_RADIUS, getHillHeight } from './Hill'
import vertexShader from '../shaders/flower.vert.glsl?raw'
import fragmentShader from '../shaders/flower.frag.glsl?raw'
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js'

// Generátor náhody se "seedem": stejný seed → vždy stejná čísla.
// Math.random() by při každém přegenerování dal jiné kytky a nešlo by porovnávat.
function createRandom(seed: number) {
    return () => {
        seed |= 0
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export class FlowerField {
    // Group = "složka" ve scéně, Experience přidá jen ji a nemusí vědět, kolik druhů máme
    group = new THREE.Group()
    private meshes: THREE.InstancedMesh[]
    private material: THREE.ShaderMaterial
    private mouseTarget = new THREE.Vector3()
    private mouseTargetStrength = 0

    // ── Všechna "magická čísla" rozmístění na jednom místě → GUI je umí měnit ──
    settings = {
        count: 15000,
        seed: 1,
        // Velikost
        sizeFreq: 0.18,     // frekvence noise (menší = větší clustery)
        sizeRampMin: 0.2,   // "ColorRamp" úchyty
        sizeRampMax: 0.7,
        clusterMin: 0.8,    // nejmenší/největší kytka v clusteru
        clusterMax: 1.2,
        edgeStart: 0.45,    // kde od kraje se začnou zmenšovat (0–1)
        edgeMinScale: 0.7,  // jak malé jsou úplně na kraji
        jitter: 0.1,        // ± náhoda velikosti
        // Barva (HSL odstín 0–1: 0.5 tyrkysová, 0.6 modrá, 0.75 fialová)
        colorFreq: 0.12,
        hueMin: 0.58,
        hueMax: 0.63,
        lightMin: 0.5,
        lightMax: 0.62,
        saturation: 0.8,
        // Druh kytky
        typeFreq: 0.1,
        typeBlend: 0.15,    // jak moc se druhy na hranici promíchají
    }

    constructor(count: number, private fog: THREE.Fog) {
        this.settings.count = count
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
                // Dřív napevno v shaderu → teď uniformy, ať je GUI může měnit
                uWindStrength: { value: 0.1 },
                uWindSpeed: { value: 1.0 },
                uPushAmount: { value: 0.6 },
                uShakeAmount: { value: 0.5 },
            },
        })

        // ── Druhy kytek: stejný stonek, jiný květ ──
        // Každý druh = vlastní geometrie = vlastní InstancedMesh. Materiál sdílí všechny.
        const types = [ATLAS.bloom, ATLAS.bloom2]

        // Kapacita `count` (víc se do meshe nevejde), skutečný počet nastaví scatter() přes mesh.count
        this.meshes = types.map((bloomRect) => {
            const geometry = createFlowerGeometry(flowerSize, bloomRect)
            const mesh = new THREE.InstancedMesh(geometry, this.material, count)
            this.group.add(mesh)
            return mesh
        })

        this.scatter()
    }

    // Rozmístí kytky podle this.settings. Dá se volat znovu → GUI ji zavolá po změně.
    scatter() {
        const S = this.settings
        const { lerp, smoothstep } = THREE.MathUtils

        const random = createRandom(S.seed)
        const noise = new SimplexNoise({ random }) // i noise dostane seed

        // ── Pomocné objekty: vytvořit JEDNOU, v cyklu jen přepisovat ──
        const matrix = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        const upAxis = new THREE.Vector3(0, 1, 0)
        const petalColor = new THREE.Color()

        for (const mesh of this.meshes) mesh.count = 0 // vyprázdnit, budeme přičítat

        for (let i = 0; i < S.count; i++) {
            const angle = random() * Math.PI * 2

            const r = HILL_RADIUS * 0.9 * Math.sqrt(random())
            const x = r * Math.cos(angle)
            const z = r * Math.sin(angle)

            // ── 1) Spherical gradient: 1 uprostřed → 0 na okraji kopce ──
            const center = 1 - r / HILL_RADIUS
            // "ColorRamp": střed zůstane plný (1), zmenšovat začne až u okraje
            const edgeFalloff = smoothstep(center, 0.0, S.edgeStart)

            // ── 2) Noise pro clustery velikosti ──
            const rawSize = noise.noise(x * S.sizeFreq, z * S.sizeFreq) * 0.5 + 0.5
            // "ColorRamp" na noise: roztáhne kontrast, ať jsou clustery vidět
            const sizeNoise = smoothstep(rawSize, S.sizeRampMin, S.sizeRampMax)

            position.set(x, getHillHeight(x, z), z)

            quaternion.setFromAxisAngle(upAxis, random() * Math.PI * 2)

            // ── 3) Kombinace: noise určí velikost v clusteru, gradient ji u kraje stáhne ──
            const clusterScale = lerp(S.clusterMin, S.clusterMax, sizeNoise)
            const edgeScale = lerp(S.edgeMinScale, 1.0, edgeFalloff)
            const jitter = 1 + (random() * 2 - 1) * S.jitter
            const s = clusterScale * edgeScale * jitter
            scale.set(s, s, s)

            matrix.compose(position, quaternion, scale)

            // ── 4) Třetí noise: který druh kytky tu roste? ──
            const typeNoise = noise.noise(x * S.typeFreq + 200, z * S.typeFreq + 200) * 0.5 + 0.5
            const blend = (random() * 2 - 1) * S.typeBlend
            const typeIndex = typeNoise + blend > 0.5 ? 1 : 0

            const mesh = this.meshes[typeIndex]!
            const slot = mesh.count++ // vezmi další volné místo v tomhle meshi
            mesh.setMatrixAt(slot, matrix)

            // ── 5) Druhý noise pro barvu: jiná frekvence + posun (+100) = jiný vzor ──
            const rawColor = noise.noise(x * S.colorFreq + 100, z * S.colorFreq + 100) * 0.5 + 0.5
            const colorNoise = smoothstep(rawColor, 0.25, 0.75)
            petalColor.setHSL(
                lerp(S.hueMin, S.hueMax, colorNoise),
                S.saturation,
                lerp(S.lightMin, S.lightMax, colorNoise),
            )
            mesh.setColorAt(slot, petalColor)
        }

        for (const mesh of this.meshes) {
            mesh.instanceMatrix.needsUpdate = true
            mesh.instanceColor!.needsUpdate = true
            // Kytky se přesunuly → přepočítat obal pro frustum culling (jinak by mohly "mizet")
            mesh.computeBoundingSphere()
        }
    }

    // Každý objekt si přidá vlastní složku do GUI → Experience nemusí znát detaily
    setupGui(gui: GUI) {
        const folder = gui.addFolder('Kytky')
        const u = this.material.uniforms

        // ── Uniformy: shader je čte každý snímek → změna je vidět hned ──
        const wind = folder.addFolder('Vítr & myš')
        wind.add(u.uWindStrength!, 'value', 0, 0.5, 0.01).name('síla větru')
        wind.add(u.uWindSpeed!, 'value', 0, 3, 0.01).name('rychlost větru')
        wind.add(u.uMouseRadius!, 'value', 0.5, 10, 0.1).name('poloměr myši')
        wind.add(u.uPushAmount!, 'value', 0, 2, 0.01).name('odhrnutí')
        wind.add(u.uShakeAmount!, 'value', 0, 2, 0.01).name('třes')

        // ── Rozmístění: počítá se na CPU → po puštění posuvníku přegenerovat ──
        const S = this.settings
        const rescatter = () => this.scatter()

        const layout = folder.addFolder('Rozmístění')
        layout.add(S, 'seed', 1, 1000, 1).onFinishChange(rescatter)
        // max = kapacita meshe (víc se nevejde)
        layout.add(S, 'count', 100, this.meshes[0]!.instanceMatrix.count, 100).name('počet').onFinishChange(rescatter)
        layout.add(S, 'typeFreq', 0.01, 0.5, 0.01).name('druh: frekvence').onFinishChange(rescatter)
        layout.add(S, 'typeBlend', 0, 0.5, 0.01).name('druh: promíchání').onFinishChange(rescatter)

        const size = folder.addFolder('Velikost')
        size.add(S, 'sizeFreq', 0.01, 0.5, 0.01).name('frekvence').onFinishChange(rescatter)
        size.add(S, 'sizeRampMin', 0, 1, 0.01).name('ramp min').onFinishChange(rescatter)
        size.add(S, 'sizeRampMax', 0, 1, 0.01).name('ramp max').onFinishChange(rescatter)
        size.add(S, 'clusterMin', 0.1, 2, 0.01).name('cluster min').onFinishChange(rescatter)
        size.add(S, 'clusterMax', 0.1, 2, 0.01).name('cluster max').onFinishChange(rescatter)
        size.add(S, 'edgeStart', 0.01, 1, 0.01).name('okraj: začátek').onFinishChange(rescatter)
        size.add(S, 'edgeMinScale', 0, 1, 0.01).name('okraj: velikost').onFinishChange(rescatter)
        size.add(S, 'jitter', 0, 0.5, 0.01).name('náhoda').onFinishChange(rescatter)

        const color = folder.addFolder('Barva')
        color.add(S, 'colorFreq', 0.01, 0.5, 0.01).name('frekvence').onFinishChange(rescatter)
        color.add(S, 'hueMin', 0, 1, 0.005).name('odstín min').onFinishChange(rescatter)
        color.add(S, 'hueMax', 0, 1, 0.005).name('odstín max').onFinishChange(rescatter)
        color.add(S, 'lightMin', 0, 1, 0.01).name('jas min').onFinishChange(rescatter)
        color.add(S, 'lightMax', 0, 1, 0.01).name('jas max').onFinishChange(rescatter)
        color.add(S, 'saturation', 0, 1, 0.01).name('sytost').onFinishChange(rescatter)

        // Tlačítko: když přidáš funkci, lil-gui z ní udělá button
        folder.add({ log: () => console.log(JSON.stringify(S, null, 2)) }, 'log').name('📋 vypsat nastavení')

        // Detailní složky zavřené, ať GUI nezabírá půl obrazovky
        size.close()
        color.close()
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
        // Čísla se do uniformy zkopírují, ne propojí → při změně mlhy (GUI) je musíme přepsat
        u.uFogNear!.value = this.fog.near
        u.uFogFar!.value = this.fog.far

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
