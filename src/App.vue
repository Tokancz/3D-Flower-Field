<script setup lang="ts">
import { ref } from 'vue'
import GardenCanvas from './components/GardenCanvas.vue'
import GardenTitle from './components/GardenTitle.vue'

// App je "prostředník": canvas mu řekne (emit), že je čas, a on to předá nadpisu (prop)
const showTitle = ref(false)
</script>

<template>
  <GardenCanvas @title="showTitle = true" />
  <GardenTitle :visible="showTitle" />
</template>
