// Hudba na pozadí přes Web Audio API.
//
// Proč ne obyčejný <audio loop>? Ten mívá na konci smyčky malou mezeru (cvaknutí).
// AudioBufferSourceNode smyčkuje bez mezery a hlasitost jde plynule prolínat.
//
// Zapojení ("kabely" jako v mixážním pultu):
//
//   [loop1] → [gain stopy] ─┐
//                           ├→ [master gain] → [reproduktory]
//   [loop2] → [gain stopy] ─┘
//
// master = mute/unmute, gain stopy = hlasitost jednotlivé stopy / prolínání.

type Track = {
    file: string
    volume: number // hlasitost téhle stopy (0–1) → pro vyvážení vrstev
}

// ── Nastavení ──
//
// 'layers'   = všechny stopy hrají NARÁZ, každá ve smyčce do nekonečna.
//              Jedna stopa v seznamu = hraje jedna, dvě = hrají obě přes sebe.
// 'playlist' = stopy se STŘÍDAJÍ s prolnutím (pro budoucí neloopující hudbu).
const MODE: 'layers' | 'playlist' = 'layers'

const TRACKS: Track[] = [
    { file: 'loops/loop1.m4a', volume: 1 },
    // { file: 'loops/loop2.m4a', volume: 0.6 }, // odkomentovat = druhá vrstva
]

const VOLUME = 0.6   // celková hlasitost (0–1)
const FADE_IN = 1.5  // náběh po zapnutí (s)
const FADE_OUT = 0.8 // doznění po vypnutí (s)

// Jen pro MODE = 'playlist'
const REPEATS = 4    // kolikrát stopa zahraje, než se prolne do další
const CROSSFADE = 4  // délka prolnutí (s)

type Voice = { source: AudioBufferSourceNode; gain: GainNode }

export class AmbientAudio {
    playing = false

    private ctx: AudioContext | null = null
    private master: GainNode | null = null
    private buffers: AudioBuffer[] = []
    private files: Promise<ArrayBuffer>[]

    // Jen pro playlist
    private voice: Voice | null = null
    private trackIndex = 0
    private switchAt = Infinity // čas (podle ctx.currentTime), kdy prolnout do další stopy
    private timer = 0

    constructor() {
        // Stáhnout soubory hned (to smí bez kliknutí), přehrát až po kliknutí
        this.files = TRACKS.map((track) =>
            fetch(import.meta.env.BASE_URL + track.file).then((r) => r.arrayBuffer()),
        )
        document.addEventListener('visibilitychange', this.onVisibilityChange)
    }

    async toggle() {
        if (this.playing) this.mute()
        else await this.unmute()
        return this.playing
    }

    private async unmute() {
        this.playing = true

        // AudioContext MUSÍ vzniknout po kliknutí uživatele (autoplay pravidla prohlížečů)
        if (!this.ctx) await this.init()
        const ctx = this.ctx!
        await ctx.resume()
        // Mezitím (během načítání) mohl uživatel kliknout znovu a vypnout → nic nedělat
        if (!this.playing) return

        // Plynulý náběh hlasitosti
        const gain = this.master!.gain
        gain.cancelScheduledValues(ctx.currentTime)
        gain.setValueAtTime(gain.value, ctx.currentTime)
        gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + FADE_IN)
    }

    private mute() {
        this.playing = false
        const ctx = this.ctx
        if (!ctx) return

        const gain = this.master!.gain
        gain.cancelScheduledValues(ctx.currentTime)
        gain.setValueAtTime(gain.value, ctx.currentTime)
        gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_OUT)

        // Po doznění "uspat" → nežere výkon a čas (ctx.currentTime) se zastaví,
        // takže po zapnutí hudba pokračuje tam, kde přestala
        setTimeout(() => {
            if (!this.playing) ctx.suspend()
        }, FADE_OUT * 1000 + 100)
    }

    private async init() {
        const ctx = new AudioContext()
        this.ctx = ctx

        this.master = ctx.createGain()
        this.master.gain.value = 0
        this.master.connect(ctx.destination)

        // ArrayBuffer (bajty souboru) → AudioBuffer (dekódované vzorky zvuku)
        const raw = await Promise.all(this.files)
        this.buffers = await Promise.all(raw.map((data) => ctx.decodeAudioData(data)))

        // Kontrola mezery ve smyčce: AAC/MP3 přidávají na začátek ticho ("priming").
        // Když je dekódovaná délka delší než originál (WAV), smyčka bude mít mezeru.
        if (import.meta.env.DEV) {
            this.buffers.forEach((b, i) =>
                console.info(`[audio] ${TRACKS[i]!.file}: ${b.duration.toFixed(3)} s`),
            )
        }

        if (MODE === 'layers') {
            // Všechny stopy naráz, startují ve stejný okamžik → vrstvy jsou v synchronu
            const startAt = ctx.currentTime + 0.05
            this.buffers.forEach((_, i) => this.startTrack(i, 0, startAt))
        } else {
            this.voice = this.startTrack(0, 0)
            // Jednou za chvíli zkontrolovat, jestli je čas prolnout.
            // Hlídáme ctx.currentTime (ne skutečný čas) → když je hudba vypnutá
            // a kontext uspaný, čas stojí a stopa se mezitím nepřepne.
            this.timer = window.setInterval(this.checkSwitch, 250)
        }
    }

    private startTrack(index: number, fadeTime: number, when = this.ctx!.currentTime): Voice {
        const ctx = this.ctx!
        const buffer = this.buffers[index]!
        const volume = TRACKS[index]!.volume

        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true

        const gain = ctx.createGain()
        if (fadeTime > 0) {
            gain.gain.setValueAtTime(0, when)
            gain.gain.linearRampToValueAtTime(volume, when + fadeTime)
        } else {
            gain.gain.value = volume
        }

        source.connect(gain).connect(this.master!)
        source.start(when)

        this.trackIndex = index
        this.switchAt = when + buffer.duration * REPEATS - CROSSFADE
        return { source, gain }
    }

    // ── Playlist: prolnutí do další stopy ──
    private checkSwitch = () => {
        const ctx = this.ctx
        if (!ctx || !this.voice || ctx.currentTime < this.switchAt) return

        // Stará stopa ztiší a zastaví se, nová zároveň nabíhá → prolnutí
        const old = this.voice
        const now = ctx.currentTime
        old.gain.gain.setValueAtTime(old.gain.gain.value, now)
        old.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE)
        old.source.stop(now + CROSSFADE)

        this.voice = this.startTrack((this.trackIndex + 1) % this.buffers.length, CROSSFADE)
    }

    // Přepnutí záložky → ztlumit (uspat), návrat → pokračovat (jen když byla zapnutá)
    private onVisibilityChange = () => {
        if (!this.ctx || !this.playing) return
        if (document.hidden) this.ctx.suspend()
        else this.ctx.resume()
    }

    dispose() {
        clearInterval(this.timer)
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
        this.ctx?.close()
    }
}
