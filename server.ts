/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import dns from 'dns';
import http from 'http';
import express from 'express';

// Ensure reliable DNS SRV resolution for MongoDB Atlas on Windows environments
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if restricted in runtime
}
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import { initStorage } from './server/storage';
import { bootstrapAdmin } from './server/auth/bootstrap';
import { apiRouter } from './server/routes/api';
import { kioskRelayManager, kioskRelayRouter } from './server/kioskRelay';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // 1. Initialize persistent storage foundation (MongoDB if MONGODB_URI configured, else JSON file adapter)
  await initStorage();

  // 2. Safely migrate any local assets to persistent storage (GridFS / S3) if available
  try {
    const { migrateLocalAssetsToPersistentStorage } = await import('./server/storage/assets');
    await migrateLocalAssetsToPersistentStorage();
  } catch (err: any) {
    console.warn('[Server Startup] Local asset migration notice:', err?.message || err);
  }

  // 3. Initialize admin bootstrap check (if INITIAL_ADMIN_PASSWORD provided)
  await bootstrapAdmin();

  const app = express();
  const PORT = Number(process.env.PORT) || 3001;
  const isProd = process.env.NODE_ENV === 'production';

  // Enable trust proxy for Cloud Run and reverse proxies
  app.set('trust proxy', 1);

  // Parse HTTP cookies (for secure HTTP-only admin session cookies)
  app.use(cookieParser());

  // Request body parsing with 10mb limit for captured photo still frames
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CORS middleware for mobile and cross-client requests
   app.use((req, res, next) => {
    const allowedOrigins = [
      'https://diwali-game-six.vercel.app',
    ];

    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    }

    res.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  // Mount backend API routes
  app.use('/api', apiRouter);
  app.use('/api/kiosk-relay', kioskRelayRouter);

  const httpServer = http.createServer(app);

  // Initialize secure WebSocket server for remote TV PC Kiosk Relay
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/ws/kiosk-relay' || url.pathname === '/api/kiosk-relay/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          kioskRelayManager.handleDeviceConnection(ws, req);
        });
        return;
      }
    } catch (err) {
      console.warn('[Upgrade] WebSocket upgrade parsing error:', err);
    }
  });

  if (!isProd) {
    // In dev: mount Vite middleware for instant live serving
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        watch: {
          ignored: [
            '**/data/**',
            '**/uploads/**',
            '**/*.log',
            '**/dist/**',
            '**/.system_generated/**',
            '**/.git/**'
          ]
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production: serve pre-built dist assets
    const distPath = path.resolve(__dirname, 'dist');
    // Long-lived caching for the self-hosted MediaPipe runtime (versioned path) and hand model
    app.use('/mediapipe', express.static(path.join(distPath, 'mediapipe'), { maxAge: '365d', immutable: true }));
    app.use('/models', express.static(path.join(distPath, 'models'), { maxAge: '30d' }));
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Diwali Motion Game server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

