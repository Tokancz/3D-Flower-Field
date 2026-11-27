import * as THREE from 'three'
import type GUI from 'lil-gui'
import { HILL_RADIUS, HILL_Y } from './Hill'
import vertexShader from '../shaders/dust.vert.glsl?raw'
import fragmentShader from '../shaders/dust.frag.glsl?raw'

// Ambientní prach/pyl: tisíce teček v jednom draw callu.
// Celý pohyb počítá vertex shader → CPU nedělá vůbec nic, jen posílá čas.
export class Dust {
    points: THREE.Points
    private material: THREE.ShaderMaterial

    constructor(count: number, private fog: THREE.Fog) {
        const bottom = HILL_Y + 1
        const height = 9

        // ── Geometrie: jen body, žádné trojúhelníky ──
        const positions = new Float32Array(count * 3)
        const randoms = new Float32Array(count)
        const scales = new Float32Array(count)

        for (let i = 0; i < count; i++) {
            // Rovnoměrně v kruhu o něco větším než kopec
            const angle = Math.random() * Math.PI * 2
            const r = HILL_RADIUS * 1.1 * Math.sqrt(Math.random())
            positions[i * 3] = Math.cos(angle) * r
            positions[i * 3 + 1] = bottom + Math.random() * height
            positions[i * 3 + 2] = Math.sin(angle) * r

            randoms[i] = Math.random()
            scales[i] = THREE.MathUtils.randFloat(0.4, 1.0)
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        // Vlastní atributy: v shaderu jako `attribute float aRandom;`
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))
        geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false, // průhledné tečky nemají "zakrývat" ostatní tečky za sebou
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: 60 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSpeed: { value: 0.25 },
                uBottom: { value: bottom },
                uHeight: { value: height },
                uColor: { value: new THREE.Color('#55B0FF') },
                uOpacity: { value: 0.6 },
                uFogNear: { value: fog.near },
                uFogFar: { value: fog.far },
            },
        })

        this.points = new THREE.Points(geometry, this.material)
        // Tečky se hýbou v shaderu → Three.js o tom neví a mohl by je chybně "odříznout"
        this.points.frustumCulled = false
    }

    update(elapsedTime: number) {
        const u = this.material.uniforms
        u.uTime!.value = elapsedTime
        u.uFogNear!.value = this.fog.near
        u.uFogFar!.value = this.fog.far
    }

    setupGui(gui: GUI) {
        const u = this.material.uniforms
        const folder = gui.addFolder('Prach')
        folder.add(u.uSize!, 'value', 5, 200, 1).name('velikost')
        folder.add(u.uSpeed!, 'value', 0, 2, 0.01).name('rychlost')
        folder.add(u.uOpacity!, 'value', 0, 1, 0.01).name('průhlednost')
        folder.addColor(u.uColor!, 'value').name('barva')
        folder.close()
    }

    dispose() {
        this.points.geometry.dispose()
        this.material.dispose()
    }
}
