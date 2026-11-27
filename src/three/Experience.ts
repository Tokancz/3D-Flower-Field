import * as THREE from 'three'
import CameraControls from 'camera-controls'
import { Hill } from './world/Hill'
import { FlowerField } from './world/FlowerField'
import Stats from 'stats.js'
import GUI from 'lil-gui'

CameraControls.install({ THREE })

export class Experience {
    private renderer: THREE.WebGLRenderer
    private scene = new THREE.Scene()
    private camera: THREE.PerspectiveCamera
    private controls: CameraControls
    private clock = new THREE.Clock()
    private resizeObserver: ResizeObserver
    private keys = new Set<string>()
    private stats = new Stats()
    // Debug panel: jen při vývoji (npm run dev). V buildu pro web zmizí.
    private gui: GUI | null = import.meta.env.DEV ? new GUI({ title: 'Debug' }) : null
    private flowerField: FlowerField
    private hill: Hill
    private raycaster = new THREE.Raycaster()
    private pointer = new THREE.Vector2()
    private pointerInside = false
    private pointerTravel = 0

    constructor(private container: HTMLElement) {
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(this.renderer.domElement)

        document.body.appendChild(this.stats.dom)

        // Pozadí + mlha stejné barvy → vzdálené věci se rozplynou
        const bg = new THREE.Color('#EEFAFF')
        this.scene.background = bg

        const fog = new THREE.Fog(bg, 30, 60)
        this.scene.fog = fog

        // Kamera
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
        this.camera.position.set(0, 8, 24)

        // Ovládání kamery
        this.controls = new CameraControls(this.camera, this.renderer.domElement)
        this.controls.mouseButtons.middle = CameraControls.ACTION.TRUCK // pan prostředním
        this.controls.minDistance = 5
        this.controls.maxDistance = 40
        this.controls.maxPolarAngle = Math.PI * 0.45
        this.controls.smoothTime = 0.4

        // Svět
        this.hill = new Hill()
        this.scene.add(this.hill.mesh)

        //FlowerAtlas
        this.flowerField = new FlowerField(15000, fog)
        this.scene.add(this.flowerField.group)

        // Každý objekt si do GUI přidá vlastní složku
        if (this.gui) {
            this.flowerField.setupGui(this.gui)
            this.gui.add(fog, 'near', 0, 100, 1).name('mlha od')
            this.gui.add(fog, 'far', 0, 150, 1).name('mlha do')
        }

        // Resize – sledujeme kontejner, ne okno
        this.resizeObserver = new ResizeObserver(this.resize)
        this.resizeObserver.observe(container)
        this.resize()

        // Klávesy
        window.addEventListener('keydown', this.onKeyDown)
        window.addEventListener('keyup', this.onKeyUp)
        this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
        this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave)

        // Render loop
        this.renderer.setAnimationLoop(this.tick)
    }

    private resize = () => {
        const { clientWidth: w, clientHeight: h } = this.container
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(w, h)
    }

    private onKeyDown = (e: KeyboardEvent) => this.keys.add(e.code)
    private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code)
    private onPointerMove = (e: PointerEvent) => {
        // Převod pixelů na souřadnice, které chce Raycaster:
        // levý okraj = -1, pravý = +1, dole = -1, nahoře = +1
        const rect = this.renderer.domElement.getBoundingClientRect()
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        this.pointerInside = true
        // Pohyb s drženým tlačítkem = ovládání kamery → nepočítat
        if (e.buttons === 0) {
        // movementX/Y = o kolik pixelů se myš pohnula od minulé události.
        // Dělíme šířkou canvasu, aby to bylo stejné na malém i velkém monitoru.
        this.pointerTravel += Math.hypot(e.movementX, e.movementY) / rect.width
        }
    }

    private onPointerLeave = () => {
        this.pointerInside = false
    }

    private tick = () => {
        this.stats.begin()
        const delta = this.clock.getDelta()

        // WASD
        const speed = 10 * delta
        if (this.keys.has('KeyW')) this.controls.forward(speed, true)
        if (this.keys.has('KeyS')) this.controls.forward(-speed, true)
        if (this.keys.has('KeyA')) this.controls.truck(-speed, 0, true)
        if (this.keys.has('KeyD')) this.controls.truck(speed, 0, true)

        this.controls.update(delta)

        let hit: THREE.Vector3 | null = null
        if (this.pointerInside) {
        this.raycaster.setFromCamera(this.pointer, this.camera)
        const hits = this.raycaster.intersectObject(this.hill.mesh)
        hit = hits[0]?.point ?? null // první zásah, nebo null když paprsek kopec minul
        }
        // Rychlost = vzdálenost / čas → "kolik šířek obrazovky za sekundu"
        const pointerSpeed = delta > 0 ? this.pointerTravel / delta : 0
        this.pointerTravel = 0 // vynulovat pro další snímek

        this.flowerField.setMouse(hit, pointerSpeed)

        this.flowerField.update(this.clock.elapsedTime, delta)
        this.renderer.render(this.scene, this.camera)
        this.stats.end()
    }

    dispose() {
        this.renderer.setAnimationLoop(null)
        this.resizeObserver.disconnect()
        window.removeEventListener('keydown', this.onKeyDown)
        window.removeEventListener('keyup', this.onKeyUp)
        this.controls.dispose()
        this.stats.dom.remove()
        this.gui?.destroy()
        this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
        this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave)

        // Uvolnit paměť GPU
        this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach((m) => m.dispose())
        }
        })
        this.renderer.dispose()
        this.renderer.domElement.remove()
    }
}