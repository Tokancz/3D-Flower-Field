import { createTimeline, type Timeline } from 'animejs'
import type CameraControls from 'camera-controls'
import type { FlowerField } from './world/FlowerField'
import type { Dust } from './world/Dust'
import type { Bees } from './world/Bees'

type IntroTargets = {
    controls: CameraControls
    flowerField: FlowerField
    dust: Dust
    bees: Bees
    onTitle: () => void   // zavolá se, když má naskočit nadpis (ten animuje Vue komponenta)
    onComplete: () => void
}

// Intro = "scénář" na časové ose (timeline). Každý krok má čas startu v ms.
//
//  0 ms ─────── kamera přilétá shora a obtáčí kopec ──────────── 4500
//     500 ──── kytky vyrůstají od vršku ven ───────── 4000
//                 2200 ● nadpis
//                    2500 ── prach se objeví ── 5000
//                       3000 ● včelky přiletí
export function createIntro(t: IntroTargets): Timeline {
    const { controls, flowerField, dust, bees } = t

    // Cílový pohled = to, co Experience nastavil (kamera na 0, 8, 24)
    const end = {
        azimuthAngle: controls.azimuthAngle,
        polarAngle: controls.polarAngle,
        distance: controls.distance,
    }

    // ── Startovní stav: nastavit HNED, ať se během načítání neukáže konec intra ──
    controls.azimuthAngle = end.azimuthAngle - 1.4 // pootočeno → kamera kopec obletí
    controls.polarAngle = 0.25                      // skoro shora
    controls.distance = controls.maxDistance        // daleko
    flowerField.growth = 0
    dust.fade = 0

    // autoplay: false → spustí se až po načtení textur (Experience zavolá .play())
    const timeline = createTimeline({
        autoplay: false,
        defaults: { ease: 'inOutSine' },
        onComplete: t.onComplete,
    })

    timeline
        // Kamera: Anime.js mění vlastnosti `controls` přímo (jsou to settery v camera-controls)
        .add(controls, {
            azimuthAngle: end.azimuthAngle,
            polarAngle: end.polarAngle,
            distance: end.distance,
            duration: 4500,
            ease: 'inOutCubic', // pomalý rozjezd, pomalé dosednutí
        }, 0)
        // Kytky: growth je getter/setter → zapisuje do uniformy uGrow v shaderu
        .add(flowerField, { growth: 1, duration: 3500, ease: 'outSine' }, 500)
        // .call = zavolat funkci v daný čas (žádná animace)
        .call(t.onTitle, 2200)
        .add(dust, { fade: 1, duration: 2500 }, 2500)
        .call(() => bees.show(), 3000)

    return timeline
}
