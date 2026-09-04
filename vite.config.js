import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// This package is "type": "module", so there's no __dirname to lean on.
const HERE = dirname(fileURLToPath(import.meta.url))

/* Vite normally serves static files out of a public/ folder, but this project
   is deliberately flat — GitHub's web uploader flattens folders, so every file
   has to sit at the repo root. This copies the handful of files that must be
   reachable at the site root (the service worker especially: a worker served
   from a subfolder can only control that subfolder) into the build output.

   Missing files are skipped with a warning rather than thrown, so a partial
   upload can never take the whole build down with it. */
const ROOT_STATIC = [
  'sw.js',
  'manifest.webmanifest',
  'nosh-icon-192.png',
  'nosh-icon-512.png',
]

function copyRootStatic() {
  let outDir = 'dist'
  return {
    name: 'nosh-copy-root-static',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const dest = resolve(HERE, outDir)
      mkdirSync(dest, { recursive: true })
      for (const file of ROOT_STATIC) {
        const from = resolve(HERE, file)
        if (!existsSync(from)) {
          this.warn(`nosh: skipping missing static file "${file}"`)
          continue
        }
        copyFileSync(from, resolve(dest, file))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyRootStatic()],
})
