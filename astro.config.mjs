// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    // Three.js ocupa ~550 KB (~136 KB comprimido). Es esperado en una web 3D
    // y se carga sin bloquear la página, así que subimos el umbral del aviso.
    build: { chunkSizeWarningLimit: 700 }
  }
});