<script setup lang="ts">
import { watch, useTemplateRef, onBeforeUnmount } from 'vue'
import { animate, splitText, stagger, type JSAnimation } from 'animejs'

// Rodič (App) řekne, kdy se má nadpis ukázat
const props = defineProps<{ visible: boolean }>()

const title = useTemplateRef<HTMLHeadingElement>('title')
let animation: JSAnimation | null = null

// watch = "sleduj tuhle hodnotu a když se změní, udělej tohle"
watch(
  () => props.visible,
  (visible) => {
    if (!visible || !title.value || animation) return // animation → jen jednou

    // Rozdělí "THE OASIS" na <span> pro každé písmeno → každé jde animovat zvlášť
    const { chars } = splitText(title.value, { chars: true })
    title.value.style.opacity = '1' // h1 je schovaný (CSS), teď už ho řídí písmena

    animation = animate(chars, {
      opacity: [0, 1],
      translateY: ['0.6em', '0em'],
      rotate: [stagger([-12, 12]), 0], // každé písmeno jiný počáteční náklon (od -12° do 12°)
      duration: 1200,
      delay: stagger(70), // písmena jedno po druhém, 70 ms rozestup
      ease: 'outExpo',
    })
  },
)

onBeforeUnmount(() => animation?.revert())
</script>

<template>
  <h1 ref="title">THE OASIS</h1>
</template>

<style scoped>
h1 {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'MonumentValley', sans-serif;
  font-size: 4rem;
  color: #333;
  text-align: center;
  margin-top: 2rem;
  user-select: none;
  pointer-events: none; /* klik "propadne" na canvas → nadpis neblokuje ovládání */
  opacity: 0; /* schovaný, dokud ho intro neukáže (žádné bliknutí při načítání) */
}
</style>
