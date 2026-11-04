import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Copies the MediaPipe Tasks Vision WASM runtime from node_modules into
 * public/mediapipe/<version>/wasm so it is served from our own origin (dev + build),
 * always matching the installed @mediapipe/tasks-vision version.
 */
const MEDIAPIPE_VERSION: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/package.json'), 'utf8')
).version;

function selfHostMediapipeWasm(): Plugin {
  const files = [
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm',
    'vision_wasm_nosimd_internal.js',
    'vision_wasm_nosimd_internal.wasm',
  ];
  return {
    name: 'self-host-mediapipe-wasm',
    buildStart() {
      const srcDir = path.resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm');
      const destDir = path.resolve(__dirname, `public/mediapipe/${MEDIAPIPE_VERSION}/wasm`);
      fs.mkdirSync(destDir, {recursive: true});
      for (const file of files) {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        const srcStat = fs.statSync(src);
        const destStat = fs.existsSync(dest) ? fs.statSync(dest) : null;
        if (!destStat || destStat.size !== srcStat.size || destStat.mtimeMs < srcStat.mtimeMs) {
          fs.copyFileSync(src, dest);
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [selfHostMediapipeWasm(), react(), tailwindcss()],
    define: {
      __MEDIAPIPE_VERSION__: JSON.stringify(MEDIAPIPE_VERSION),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.PORT || 3001}`,
          changeOrigin: true,
          secure: false,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/data/**',
          '**/uploads/**',
          '**/*.log',
          '**/dist/**',
          '**/.system_generated/**',
          '**/.git/**'
        ]
      },
    },
  };
});
