import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `kiss-for-react` is linked from the repository root (see package.json), which has its own
    // copy of React in its node_modules. Dedupe so the app and the library share one React instance.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rolldownOptions: {
      output: {
        // Kiss's ClassPersistor (de)serializes the state by class name,
        // so the minifier must not rename the classes.
        keepNames: true,
      },
    },
  },
})
