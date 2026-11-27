<script setup lang="ts">
import { ref } from 'vue'
import GardenCanvas from './components/GardenCanvas.vue'
import GardenTitle from './components/GardenTitle.vue'
import SoundToggle from './components/SoundToggle.vue'

// App je "prostředník": canvas mu řekne (emit), že je čas, a on to předá nadpisu (prop)
const showTitle = ref(false)
</script>

<template>
  <main>
    <GardenCanvas @title="showTitle = true" />
    <GardenTitle :visible="showTitle" />

    <!-- Canvas je pro Google i čtečky obrazovky "prázdný obrázek".
         Tenhle text není vidět, ale roboti a nevidomí uživatelé ho přečtou. -->
    <p class="visually-hidden">
      Klidná 3D zahrádka: kopeček posetý modrými kytkami, nad kterými létají včelky.
      Pohybem myši kytky rozvlníš, včelky se při tom polekají a odletí.
      Kamera: tažení myší otáčí, prostřední tlačítko posouvá, kolečko přibližuje,
      klávesy W A S D pohyb. Klávesa M zapne nebo vypne hudbu.
    </p>

    <SoundToggle :visible="showTitle" />
  </main>
</template>

<style>
/* Skryté pro oči, ale ne pro čtečky obrazovky a vyhledávače.
   (display: none by to schovalo i jim – proto tenhle "trik") */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
