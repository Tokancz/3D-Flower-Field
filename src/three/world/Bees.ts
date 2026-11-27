import * as THREE from 'three'
import type GUI from 'lil-gui'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { FlowerField } from './FlowerField'

// Sdílené nastavení všech včelek (GUI ho mění, včelky si ho čtou každý snímek)
const settings = {
    size: 0.5,          // velikost spritu (kytka je vysoká 2)
    speed: 2.2,          // rychlost letu (jednotky/s)
    steering: 2.5,       // jak ostře zatáčí (víc = míň plynulé oblouky)
    wobble: 0.8,         // kličkování do stran během letu
    hoverHeight: 0.25,   // jak vysoko nad květem se vznáší
    cruiseLift: 1.0,     // o kolik výš letí mezi kytkami (oblouk)
    hoverMin: 1.5,       // jak dlouho opyluje (s)
    hoverMax: 4.0,
    flightDistance: 5,   // jak daleko létá na další kytku
    // Polekání
    scareRadius: 2.5,    // jak blízko od květu musí myš projet
    scareSpeed: 0.2,     // jak rychle musí myš jet (0–1, 1 = "plná síla" vlny)
    fleeDistance: 12,    // jak daleko uletí
    panicBoost: 2.5,     // kolikrát rychleji letí v panice
    panicDuration: 2.5,  // za jak dlouho (s) panika opadne
    // Trail
    trailLife: 2.5,      // jak dlouho (s) trail zůstává
    trailSpacing: 0.08,  // vzdálenost mezi body trailu
    dashSize: 0.15,
    gapSize: 0.12,
    lineWidth: 2,        // v pixelech
    trailColor: '#55B0FF',
}

// Pomocné vektory: sdílené, aby se v update() nevytvářely nové objekty každý snímek
const _toTarget = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _side = new THREE.Vector3()
const _camRight = new THREE.Vector3()
const _camUp = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _mouse = new THREE.Vector2()
const _trailColor = new THREE.Color()
const _mixed = new THREE.Color()

type TrailPoint = { x: number; y: number; z: number; time: number; distance: number }

class Bee {
    sprite: THREE.Sprite
    trail: Line2
    private material: THREE.SpriteMaterial
    private trailMaterial: LineMaterial

    private position = new THREE.Vector3()
    private velocity = new THREE.Vector3()
    private target = new THREE.Vector3()   // květ, na který letí
    private state: 'fly' | 'hover' = 'fly'
    private hoverTimer = 0
    private phase = Math.random() * 100    // každá včelka kličkuje jinak
    private facing = -1                    // -1 = kouká doleva (jako obrázek), +1 = doprava
    private tilt = 0
    private panic = 0                      // 1 = právě se lekla, postupně klesá k 0

    // Trail = historie pozic. "distance" = ujetá vzdálenost v tom bodě (tachometr)
    private trailPoints: TrailPoint[] = []
    private odometer = 0

    constructor(
        baseMaterial: THREE.SpriteMaterial,
        private flowers: FlowerField,
        start: THREE.Vector3,
        private background: THREE.Color, // trail do ní bledne
    ) {
        // Každá včelka vlastní kopii materiálu → vlastní rotace (naklánění).
        this.material = baseMaterial.clone()
        // Vlastní kopie textur → každá včelka se může zrcadlit sama.
        // Obrázek se na GPU nahraje jen jednou, kopie sdílí stejný zdroj (texture.source).
        this.material.map = baseMaterial.map!.clone()
        this.material.alphaMap = baseMaterial.alphaMap!.clone()
        this.sprite = new THREE.Sprite(this.material)
        this.position.copy(start)
        this.flowers.getBloomNear(this.position, this.target, settings.flightDistance)

        this.trailMaterial = new LineMaterial({
            linewidth: settings.lineWidth,
            dashed: true,
            dashSize: settings.dashSize,
            gapSize: settings.gapSize,
            vertexColors: true, // barva po bodech → trail může blednout do pozadí
            fog: true,
        })
        this.trail = new Line2(new LineGeometry(), this.trailMaterial)
        this.trail.visible = false
        this.trail.frustumCulled = false // obal se mění každou chvíli, nevyplatí se počítat
    }

    // mouse = kde myš hrabe (x, z), brush = jak silně (0 = vůbec)
    update(time: number, delta: number, camera: THREE.Camera, mouse: THREE.Vector2, brush: number) {
        const S = settings
        const smooth = (rate: number) => 1 - Math.exp(-delta * rate)

        // Bod, kam míříme: nad květ. Dokud jsme daleko, letíme výš → oblouk přes kytky.
        _toTarget.copy(this.target).sub(this.position)
        const distance = _toTarget.length()
        _toTarget.y += S.hoverHeight + S.cruiseLift * THREE.MathUtils.smoothstep(distance, 0.5, 3)

        // ── Polekání ──
        // Jen u květu (opyluje nebo přistává) a jen když už není v panice
        const atFlower = this.state === 'hover' || distance < 1.5
        if (atFlower && this.panic < 0.3 && brush > S.scareSpeed) {
            const mouseToFlower = Math.hypot(this.target.x - mouse.x, this.target.z - mouse.y)
            if (mouseToFlower < S.scareRadius) this.scare(mouse)
        }
        // Panika plynule opadá (za panicDuration sekund je skoro na nule)
        this.panic *= Math.exp((-delta * 3) / S.panicDuration)

        if (this.state === 'fly') {
            // V panice rychleji a víc kličkuje
            const speed = S.speed * (1 + this.panic * (S.panicBoost - 1))
            const wobble = S.wobble * (1 + this.panic * 2)

            // Řízení (steering): "chci letět tímhle směrem" a rychlost se k tomu plynule stáčí
            const arrive = Math.min(1, distance / 1.5) // u květu zpomalit
            _desired.copy(_toTarget).normalize().multiplyScalar(speed * arrive)

            // Kličkování: přičíst sinus kolmo na směr letu
            _side.crossVectors(_desired, _up).normalize()
            _desired.addScaledVector(_side, Math.sin(time * (3 + this.panic * 5) + this.phase) * wobble * arrive)

            this.velocity.lerp(_desired, smooth(S.steering))

            if (distance < 0.3) {
                this.state = 'hover'
                this.hoverTimer = THREE.MathUtils.randFloat(S.hoverMin, S.hoverMax)
            }
        } else {
            // Opylování: zabrzdit a jemně kroužit nad květem
            _desired.set(
                Math.sin(time * 2 + this.phase) * 0.15,
                Math.sin(time * 3.1 + this.phase) * 0.05,
                Math.cos(time * 2 + this.phase) * 0.15,
            )
            _desired.add(_toTarget) // + táhnout zpátky nad květ
            this.velocity.lerp(_desired, smooth(4))

            this.hoverTimer -= delta
            if (this.hoverTimer <= 0) {
                this.flowers.getBloomNear(this.position, this.target, S.flightDistance)
                this.state = 'fly'
            }
        }

        this.position.addScaledVector(this.velocity, delta)

        // ── Sprite ──
        // Jemné poskakování nahoru-dolů (mávání křídly naznačené pohybem)
        this.sprite.position.copy(this.position)
        this.sprite.position.y += Math.sin(time * 18 + this.phase) * 0.02

        // Směr na OBRAZOVCE: vezmeme osy kamery (doprava, nahoru) a promítneme na ně rychlost
        _camRight.setFromMatrixColumn(camera.matrixWorld, 0)
        _camUp.setFromMatrixColumn(camera.matrixWorld, 1)
        const screenX = this.velocity.dot(_camRight)
        const screenY = this.velocity.dot(_camUp)

        // Překlopení: facing jede plynule z -1 na +1 → scale.x projde nulou = "otočení listu papíru"
        if (Math.abs(screenX) > 0.15) {
            const wanted = Math.sign(screenX)
            const step = delta * 6 // celé otočení ≈ 0.33 s
            this.facing += THREE.MathUtils.clamp(wanted - this.facing, -step, step)
        }
        // Šířka = |facing| → při otáčení se zúží na nulu a zase roztáhne
        this.sprite.scale.set(Math.max(Math.abs(this.facing), 0.02) * S.size, S.size, 1)
        // Obrázek kouká doleva → když letí doprava (facing > 0), zrcadlit texturu.
        // Záporné scale.x u Spritu nefunguje (Three.js bere jen velikost), proto přes UV:
        // repeat -1 = čti obrázek pozpátku, offset 1 = začni od pravého okraje.
        const mirrored = this.facing > 0
        for (const tex of [this.material.map!, this.material.alphaMap!]) {
            tex.repeat.x = mirrored ? -1 : 1
            tex.offset.x = mirrored ? 1 : 0
        }

        // Naklonění: letí nahoru → špička nahoru. Vynásobit facing, protože zrcadlení otočí smysl.
        const wantedTilt = THREE.MathUtils.clamp(screenY * 0.25, -0.5, 0.5) * this.facing
        this.tilt += (wantedTilt - this.tilt) * smooth(6)
        this.material.rotation = this.tilt

        this.updateTrail(time)
    }

    private scare(mouse: THREE.Vector2) {
        const S = settings
        this.panic = 1
        this.state = 'fly'

        // Nový cíl daleko, pokud možno na opačné straně než kurzor
        this.flowers.getBloomNear(this.position, this.target, S.fleeDistance, mouse)

        // "Kopanec": okamžitě vyletět nahoru a pryč od kurzoru.
        // Přičítáme přímo k rychlosti → steering ho pak plynule stočí k novému cíli.
        let awayX = this.position.x - mouse.x
        let awayZ = this.position.z - mouse.y
        const length = Math.hypot(awayX, awayZ) || 1 // || 1 = ochrana před dělením nulou
        awayX /= length
        awayZ /= length
        this.velocity.x += awayX * 4
        this.velocity.z += awayZ * 4
        this.velocity.y += 3
    }

    private updateTrail(time: number) {
        const S = settings
        let changed = false

        // Přidat bod, když včelka uletěla dost daleko od posledního
        const last = this.trailPoints[this.trailPoints.length - 1]
        const p = this.position
        const step = last ? Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) : 0
        if (!last || step > S.trailSpacing) {
            this.odometer += step
            this.trailPoints.push({ x: p.x, y: p.y, z: p.z, time, distance: this.odometer })
            changed = true
        }

        // Odebrat staré body → trail se sám "dojídá" i když včelka stojí
        while (this.trailPoints.length > 0 && time - this.trailPoints[0]!.time > S.trailLife) {
            this.trailPoints.shift()
            changed = true
        }

        if (!changed) return

        const count = this.trailPoints.length
        this.trail.visible = count >= 2
        if (count < 2) return

        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)
        _trailColor.set(S.trailColor)

        this.trailPoints.forEach((pt, i) => {
            positions.set([pt.x, pt.y, pt.z], i * 3)
            // Nejstarší bod (i = 0) = barva pozadí, nejnovější = barva trailu → "bledne"
            const t = i / (count - 1)
            _mixed.lerpColors(this.background, _trailColor, t)
            colors.set([_mixed.r, _mixed.g, _mixed.b], i * 3)
        })

        // LineGeometry neumí měnit počet bodů → nová geometrie, stará se uvolní z GPU
        const geometry = new LineGeometry()
        geometry.setPositions(positions)
        geometry.setColors(colors)
        this.trail.geometry.dispose()
        this.trail.geometry = geometry
        this.trail.computeLineDistances()

        // computeLineDistances() měří od NEJSTARŠÍHO bodu. Ten se ale pořád posouvá,
        // takže by čárky "ujížděly". Posunutím o tachometr prvního bodu zůstanou čárky
        // přilepené ve světě – jako vyšlapaná cestička.
        this.trailMaterial.dashOffset = this.trailPoints[0]!.distance
        this.trailMaterial.dashSize = S.dashSize
        this.trailMaterial.gapSize = S.gapSize
        this.trailMaterial.linewidth = S.lineWidth
    }

    dispose() {
        this.material.map?.dispose()
        this.material.alphaMap?.dispose()
        this.material.dispose()
        this.trail.geometry.dispose()
        this.trailMaterial.dispose()
    }
}

export class Bees {
    group = new THREE.Group()
    private bees: Bee[] = []
    private baseMaterial: THREE.SpriteMaterial

    private shown = false

    constructor(count: number, private flowers: FlowerField, background: THREE.Color, loadingManager?: THREE.LoadingManager) {
        // Schované, dokud je intro nezavolá přes show().
        // (Textury načítá společný manager z Experience → intro začne, až je všechno načtené.)
        this.group.visible = false
        const loader = new THREE.TextureLoader(loadingManager)
        const map = loader.load(import.meta.env.BASE_URL + 'textures/bee/Bee_500px_Albedo.png')
        map.colorSpace = THREE.SRGBColorSpace
        const alphaMap = loader.load(import.meta.env.BASE_URL + 'textures/bee/Bee_500px_Alpha.png')

        this.baseMaterial = new THREE.SpriteMaterial({
            map,
            alphaMap,
            alphaTest: 0.5, // jako u kytek: průhledné pixely zahodit, ostré okraje
        })

        const start = new THREE.Vector3()
        for (let i = 0; i < count; i++) {
            // Start vysoko za okrajem kopce → po show() včelky přiletí "zvenku"
            const angle = Math.random() * Math.PI * 2
            start.set(Math.cos(angle) * 22, THREE.MathUtils.randFloat(5, 9), Math.sin(angle) * 22)
            const bee = new Bee(this.baseMaterial, flowers, start, background)
            this.bees.push(bee)
            this.group.add(bee.sprite, bee.trail)
        }
    }

    // Zavolá intro → včelky se objeví a začnou létat
    show() {
        this.shown = true
        this.group.visible = true
    }

    update(time: number, delta: number, camera: THREE.Camera) {
        if (!this.shown) return // schované včelky nelétají → po show() startují zvenku
        // Ochrana: po přepnutí záložky může být delta obří → včelky by "teleportovaly"
        const dt = Math.min(delta, 1 / 20)
        // Kde myš hrabe – zjistit JEDNOU za snímek, ne pro každou včelku zvlášť
        const brush = this.flowers.getMouseBrush(_mouse)
        for (const bee of this.bees) bee.update(time, dt, camera, _mouse, brush)
    }

    setupGui(gui: GUI) {
        const folder = gui.addFolder('Včelky')
        folder.add(settings, 'size', 0.1, 1, 0.01).name('velikost')
        folder.add(settings, 'speed', 0.5, 6, 0.1).name('rychlost')
        folder.add(settings, 'steering', 0.5, 8, 0.1).name('zatáčení')
        folder.add(settings, 'wobble', 0, 3, 0.05).name('kličkování')
        folder.add(settings, 'cruiseLift', 0, 3, 0.05).name('výška letu')
        folder.add(settings, 'flightDistance', 1, 15, 0.5).name('vzdálenost letu')
        folder.add(settings, 'hoverMin', 0, 5, 0.1).name('opylování min (s)')
        folder.add(settings, 'hoverMax', 0, 10, 0.1).name('opylování max (s)')

        const scare = folder.addFolder('Polekání')
        scare.add(settings, 'scareRadius', 0.5, 6, 0.1).name('dosah myši')
        scare.add(settings, 'scareSpeed', 0, 1, 0.01).name('citlivost (min. rychlost)')
        scare.add(settings, 'fleeDistance', 3, 25, 0.5).name('jak daleko uletí')
        scare.add(settings, 'panicBoost', 1, 5, 0.1).name('zrychlení v panice')
        scare.add(settings, 'panicDuration', 0.5, 6, 0.1).name('délka paniky (s)')

        const trail = folder.addFolder('Trail')
        trail.add(settings, 'trailLife', 0.2, 8, 0.1).name('délka (s)')
        trail.add(settings, 'dashSize', 0.01, 1, 0.01).name('čárka')
        trail.add(settings, 'gapSize', 0.01, 1, 0.01).name('mezera')
        trail.add(settings, 'lineWidth', 0.5, 8, 0.5).name('tloušťka (px)')
        trail.addColor(settings, 'trailColor').name('barva')
        folder.close()
    }

    dispose() {
        this.bees.forEach((b) => b.dispose())
        this.baseMaterial.map?.dispose()
        this.baseMaterial.alphaMap?.dispose()
        this.baseMaterial.dispose()
    }
}
