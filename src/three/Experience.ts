import * as THREE from 'three'
import CameraControls from 'camera-controls'
import { Hill, getHillHeight } from './world/Hill'
import { FlowerField } from './world/FlowerField'
import Stats from 'stats.js'

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

  constructor(private container: HTMLElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    document.body.appendChild(this.stats.dom)

    // Pozadí + mlha stejné barvy → vzdálené věci se rozplynou
    const bg = new THREE.Color('#EEFAFF')
    this.scene.background = bg
    this.scene.fog = new THREE.Fog(bg, 20, 60)

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
    this.scene.add(new Hill().mesh)

    //FlowerAtlas
    this.scene.add(new FlowerField(5000).mesh)

    // Resize – sledujeme kontejner, ne okno
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(container)
    this.resize()

    // Klávesy
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

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