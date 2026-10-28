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
import { initStorage } from './server/storage';
import { bootstrapAdmin } from './server/auth/bootstrap';
import { apiRouter } from './server/routes/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // 1. Initialize persistent storage foundation (MongoDB if MONGODB_URI configured, else JSON file adapter)
  await initStorage();

  // 2. Initialize admin bootstrap check (if INITIAL_ADMIN_PASSWORD provided)
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
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Mount backend API routes
  app.use('/api', apiRouter);

  const httpServer = http.createServer(app);

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
