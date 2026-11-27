<script setup lang="ts">
import { onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import { Experience } from '@/three/Experience'

// Události, které komponenta posílá rodiči ("data dolů přes props, zprávy nahoru přes emit")
const emit = defineEmits<{ title: [] }>()

const container = useTemplateRef<HTMLDivElement>('container')
let experience: Experience | null = null
onMounted(() => {
  experience = new Experience(container.value!, {
    onTitle: () => emit('title'), // 3D svět → Vue
  })
})

onBeforeUnmount(() => {
  experience?.dispose()
  experience = null
})
</script>

<template>
  <div ref="container" class="garden" />
</template>

<style scoped>
.garden {
  position: fixed;
  inset: 0;
}
</style>