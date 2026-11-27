<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { AmbientAudio } from '@/audio/AmbientAudio'

// Objeví se spolu s nadpisem (po intru)
defineProps<{ visible: boolean }>()

const playing = ref(false)
const loading = ref(false) // mezi kliknutím a prvním tónem (dekódování souborů)
let audio: AmbientAudio | null = null

async function toggle() {
  if (!audio) return
  loading.value = !playing.value
  playing.value = await audio.toggle()
  loading.value = false
}

// Klávesa M = mute/unmute
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'KeyM' && !e.repeat) toggle()
}

onMounted(() => {
  audio = new AmbientAudio()
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  audio?.dispose()
})
</script>

<template>
  <button
    class="sound"
    :class="{ playing, loading, visible }"
    :aria-label="playing ? 'Vypnout hudbu (M)' : 'Zapnout hudbu (M)'"
    :aria-pressed="playing"
    :title="playing ? 'Vypnout hudbu (M)' : 'Zapnout hudbu (M)'"
    @click="toggle"
  >
    <!-- 4 sloupečky "ekvalizéru": hraje → skáčou, ticho → leží -->
    <span v-for="i in 4" :key="i" class="bar" :style="{ '--i': i }" />
  </button>
</template>

<style scoped>
.sound {
  position: fixed;
  right: 2rem;
  bottom: 2rem;
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(6px);
  cursor: pointer;

  /* Schované, dokud intro neřekne visible */
  opacity: 0;
  transform: translateY(0.5rem);
  pointer-events: none;
  transition: opacity 0.8s ease, transform 0.8s ease, background 0.2s;
}

.sound.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.sound:hover {
  background: rgba(255, 255, 255, 0.9);
}

.sound:focus-visible {
  outline: 2px solid #55b0ff;
  outline-offset: 3px;
}

.bar {
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: #222;
  transform-origin: center;
  /* Ticho: skoro ploché čárky */
  transform: scaleY(0.15);
  transition: transform 0.4s ease;
}

/* Hraje: každý sloupeček skáče jinou rychlostí (--i = pořadí 1–4) */
.playing .bar {
  animation: bounce calc(0.7s + var(--i) * 0.13s) ease-in-out infinite alternate;
  animation-delay: calc(var(--i) * -0.2s);
}

/* Načítání: sloupečky pomalu pulzují */
.loading .bar {
  animation: pulse 0.8s ease-in-out infinite alternate;
  animation-delay: calc(var(--i) * 0.1s);
}

@keyframes bounce {
  from { transform: scaleY(0.25); }
  to { transform: scaleY(1); }
}

@keyframes pulse {
  from { transform: scaleY(0.15); }
  to { transform: scaleY(0.4); }
}

/* Uživatelé, kteří mají v systému "omezit pohyb" → bez skákání */
@media (prefers-reduced-motion: reduce) {
  .playing .bar,
  .loading .bar {
    animation: none;
    transform: scaleY(0.7);
  }
}
</style>
