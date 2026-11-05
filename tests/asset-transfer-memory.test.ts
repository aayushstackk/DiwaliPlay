/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs the real server (temp directory, no real data or .env) and measures its peak RSS across one 40 MB upload
 * and two throttled 40 MB downloads at once, on GridFS (production) and on the local provider.
 */

import { spawn, execFile, ChildProcess } from 'child_process';
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { pathToFileURL } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const MB = 1024 * 1024;
const FILE_BYTES = 39 * MB;
const THROTTLE_BYTES_PER_SECOND = 8 * MB;
/** One upload is held in memory by multer. Two buffered downloads on top went well past this. */
const MAX_GROWTH_MB = Number(process.env.MAX_RSS_GROWTH_MB || 100);
const PASSWORD = 'Throwaway-Test-Pass-1!';
const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function rssMb(pid: number): Promise<number> {
  const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]);
  return Number(stdout.trim()) / 1024;
}

async function startServer(cwd: string, port: number, env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ['--import', pathToFileURL(path.join(repoRoot, 'node_modules/tsx/dist/loader.mjs')).href, path.join(repoRoot, 'server.ts')],
    {
      cwd,
      env: {
        PATH: process.env.PATH || '',
        HOME: cwd,
        NODE_ENV: 'production',
        PORT: String(port),
        INITIAL_ADMIN_USERNAME: 'memcheck',
        INITIAL_ADMIN_PASSWORD: PASSWORD,
        ...env
      },
      stdio: ['ignore', 'ignore', 'inherit']
    }
  );
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/settings`)).ok) return child;
    } catch {
      // Not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill('SIGKILL');
  throw new Error('server did not start');
}

function throttledDownload(url: string): Promise<{ status: number; hash: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const started = Date.now();
    http
      .get(url, (res) => {
        res.on('data', (chunk: Buffer) => {
          hash.update(chunk);
          bytes += chunk.length;
          const due = started + (bytes / THROTTLE_BYTES_PER_SECOND) * 1000;
          const wait = due - Date.now();
          if (wait > 0) {
            res.pause();
            setTimeout(() => res.resume(), wait);
          }
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, hash: hash.digest('hex'), bytes }));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function measure(label: string, env: Record<string, string>, payload: Buffer<ArrayBuffer>) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-memory-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = await startServer(cwd, port, env);
  try {
    const login = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'memcheck', password: PASSWORD })
    });
    assert.strictEqual(login.status, 200, `login ${login.status}`);
    const { token } = (await login.json()) as any;

    const upload = async () => {
      const form = new FormData();
      form.append('category', 'start_backgrounds');
      form.append('file', new Blob([payload], { type: 'video/mp4' }), 'bg.mp4');
      const res = await fetch(`${base}/api/admin/assets/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      assert.strictEqual(res.status, 201, `upload ${res.status}`);
      return ((await res.json()) as any).asset as { id: string; url: string };
    };

    const startRss = await rssMb(child.pid!);
    const seeded = await upload();
    const contentUrl = `${base}/api/assets/${seeded.id}/content`;

    // A plain download and 304 check, then let the upload's buffer settle: that's the idle figure.
    const first = await fetch(contentUrl);
    const etag = first.headers.get('etag')!;
    assert.strictEqual(sha(Buffer.from(await first.arrayBuffer())), sha(payload), 'plain download identical');
    const revalidated = await fetch(contentUrl, { headers: { 'If-None-Match': etag } });
    assert.strictEqual(revalidated.status, 304);
    await new Promise((r) => setTimeout(r, 3000));
    const idle = await rssMb(child.pid!);

    let peak = idle;
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        peak = Math.max(peak, await rssMb(child.pid!));
        await new Promise((r) => setTimeout(r, 50));
      }
    })();
    const started = Date.now();
    const [, a, b] = await Promise.all([upload(), throttledDownload(contentUrl), throttledDownload(contentUrl)]);
    const seconds = (Date.now() - started) / 1000;
    sampling = false;
    await sampler;

    assert.strictEqual(a.status, 200);
    assert.strictEqual(b.status, 200);
    assert.strictEqual(a.hash, sha(payload), 'throttled download A identical');
    assert.strictEqual(b.hash, sha(payload), 'throttled download B identical');

    const growth = peak - idle;
    console.log(
      `  ${label}: RSS ${startRss.toFixed(0)} MB at start, ${idle.toFixed(0)} MB idle, peak ${peak.toFixed(0)} MB ` +
        `(+${growth.toFixed(0)} MB) across 1 upload + 2 throttled downloads of ${(payload.length / MB).toFixed(0)} MB in ${seconds.toFixed(1)} s`
    );
    return { label, idle, peak, growth };
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function main() {
  console.log('▶ Concurrent 40 MB transfer memory');
  const payload = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypisom'),
    crypto.randomBytes(FILE_BYTES - 12)
  ]);
  const mongod = await MongoMemoryServer.create();
  const results = [];
  try {
    results.push(await measure('GridFS', { MONGODB_URI: mongod.getUri() }, payload));
  } finally {
    await mongod.stop();
  }
  results.push(await measure('Local ', {}, payload));
  for (const r of results) {
    assert(r.growth < MAX_GROWTH_MB, `${r.label} grew ${r.growth.toFixed(0)} MB, limit ${MAX_GROWTH_MB} MB`);
  }
  console.log('  ✅ PASSED\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Transfer memory check failed:', err);
  process.exit(1);
});
