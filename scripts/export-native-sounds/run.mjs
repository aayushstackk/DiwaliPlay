#!/usr/bin/env node
/**
 * One-command native sound export.
 *
 *   node scripts/export-native-sounds/run.mjs [--out <wavDir>] [--no-convert] [--only <key>]
 *
 * --only renders that one sound. The other committed files are left exactly as they are (Chrome
 * differs by +-1 LSB between runs); only the new FLAC and manifest.json change.
 *
 * 1. Starts the repo's Vite dev server (repo vite.config.ts) on a free localhost port.
 * 2. Launches the installed Google Chrome headless with a throwaway profile and drives it
 *    over the Chrome DevTools Protocol (repo `ws` dependency, no Playwright/Puppeteer).
 * 3. Opens /scripts/export-native-sounds/index.html, renders each sound with exportSound(key)
 *    and writes <wavDir>/<key>.wav plus <wavDir>/plan.json (manifest ids + render stats).
 * 4. Stops only the Chrome it started, deletes the profile, closes Vite.
 * 5. Runs convert.sh <wavDir> (FLAC + manifest.json + manifest check) unless --no-convert.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createServer } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const CHROME =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(os.tmpdir(), 'diwali-native-sounds-wav'));
const CONVERT = !args.includes('--no-convert');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url, { maxPayload: 512 * 1024 * 1024 });
    this.nextId = 1;
    this.waiters = new Map();
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.waiters.has(msg.id)) {
        const { resolve, reject } = this.waiters.get(msg.id);
        this.waiters.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[page exception]', msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
      } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
        console.error(`[page ${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description).join(' '));
      }
    });
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.waiters.set(id, { resolve, reject }));
  }
  async evaluate(expression, awaitPromise = false) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result.value;
  }
  close() {
    this.ws.close();
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith('.wav') || f === 'plan.json') fs.rmSync(path.join(OUT, f));
  }

  const vitePort = await freePort();
  const vite = await createServer({
    root: REPO,
    configFile: path.join(REPO, 'vite.config.ts'),
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: vitePort, strictPort: true, hmr: false, watch: null },
  });
  await vite.listen();
  const pageUrl = `http://127.0.0.1:${vitePort}/scripts/export-native-sounds/index.html`;
  console.log(`[export] Vite on ${pageUrl}`);

  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'diwali-sound-export-chrome-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  console.log(`[export] Chrome pid ${chrome.pid}, CDP port ${debugPort}`);
  const chromeExited = new Promise((r) => chrome.once('exit', r));

  let cdp;
  try {
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch {
        /* not up yet */
      }
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('Chrome DevTools endpoint did not come up');

    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: pageUrl });

    let ready = false;
    for (let i = 0; i < 600 && !ready; i++) {
      try {
        ready = (await cdp.evaluate('window.exportReady === true')) === true;
      } catch {
        /* navigating */
      }
      if (!ready) await sleep(100);
    }
    if (!ready) throw new Error('export page did not become ready');

    const plan = await cdp.evaluate('exportPlan()');
    if (ONLY && !plan.some((job) => job.key === ONLY)) throw new Error(`unknown job ${ONLY}`);
    const entries = [];
    for (const job of plan) {
      // The plan stays whole, so manifest.ts still writes and checks every entry.
      if (ONLY && job.key !== ONLY) {
        entries.push({ ...job, file: `${job.key}.wav` });
        continue;
      }
      const t0 = Date.now();
      const r = await cdp.evaluate(`exportSound(${JSON.stringify(job.key)})`, true);
      const wav = Buffer.from(r.wavBase64, 'base64');
      fs.writeFileSync(path.join(OUT, `${job.key}.wav`), wav);
      entries.push({ ...job, file: `${job.key}.wav`, stats: r.stats });
      const s = r.stats;
      console.log(
        `[export] ${job.key.padEnd(24)} ${s.durationSec.toFixed(3)}s peak ${s.peakDbfs} dBFS rms ${s.rmsDbfs} dBFS` +
          (s.clippedSamples ? ` CLIPPED ${s.clippedSamples}` : '') +
          (s.periodMs ? ` period ${s.periodMs}ms edgeJump ${s.loopEdgeJump.toExponential(2)} tail ${s.loopTailPeakDbfs} dBFS nextDiff ${s.nextPeriodDiffDb} dB` : '') +
          ` (${Date.now() - t0} ms)`
      );
    }
    fs.writeFileSync(
      path.join(OUT, 'plan.json'),
      JSON.stringify({ sampleRate: 48000, entries }, null, 2) + '\n'
    );
    console.log(`[export] wrote ${ONLY ? 1 : entries.length} WAVs + plan.json to ${OUT}`);
  } finally {
    if (cdp) cdp.close();
    if (chrome.exitCode === null) {
      chrome.kill('SIGTERM');
      const timeout = sleep(5000).then(() => 'timeout');
      if ((await Promise.race([chromeExited, timeout])) === 'timeout') {
        chrome.kill('SIGKILL');
        await chromeExited;
      }
    }
    fs.rmSync(profile, { recursive: true, force: true });
    await vite.close();
  }

  if (CONVERT) {
    const convertArgs = [path.join(HERE, 'convert.sh'), OUT, ...(ONLY ? ['--keep-existing'] : [])];
    const r = spawnSync('bash', convertArgs, { cwd: REPO, stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
}

main().catch((err) => {
  console.error('[export] FAILED:', err);
  process.exit(1);
});
