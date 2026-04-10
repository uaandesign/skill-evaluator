#!/usr/bin/env node
/**
 * Production build script using system esbuild.
 * Bypasses Vite/rollup which need platform-specific native binaries.
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ESBUILD = '/usr/local/lib/node_modules_global/lib/node_modules/tsx/node_modules/.bin/esbuild';
const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');

function clean() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  mkdirSync(join(DIST, 'assets'), { recursive: true });
}

clean();
console.log('Building Skill Evaluator v2.0...');

// Banner: define import.meta.env shim before the bundle runs
// This covers any import.meta.env usage that esbuild doesn't inline
const banner = `var __importMetaEnv={VITE_API_URL:"",MODE:"production",DEV:false,PROD:true,SSR:false,BASE_URL:"/"};`;

const baseArgs = [
  ESBUILD,
  join(SRC, 'main.jsx'),
  '--bundle',
  '--minify',
  '--sourcemap',
  '--jsx=automatic',
  '--loader:.jsx=jsx',
  '--loader:.js=jsx',
  '--loader:.css=css',
  `--outdir=${join(DIST, 'assets')}`,
  '--entry-names=[name]-[hash]',
  '--asset-names=[name]-[hash]',
  `--define:process.env.NODE_ENV='"production"'`,
  `--define:import.meta.env.VITE_API_URL='""'`,
  `--define:import.meta.env.MODE='"production"'`,
  `--define:import.meta.env.DEV='false'`,
  `--define:import.meta.env.PROD='true'`,
  `--define:import.meta.env.SSR='false'`,
  `--define:import.meta.env.BASE_URL='"/"'`,
];

// Try 1: ESM with splitting
console.log('  → Attempting ESM build with code splitting...');
try {
  execSync(
    [...baseArgs, '--format=esm', '--target=chrome90', '--splitting', '--chunk-names=chunk-[hash]'].join(' '),
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_PATH: join(ROOT, 'node_modules') } }
  );
  console.log('  ✓ ESM build succeeded');
} catch {
  // Try 2: ESM without splitting
  console.log('  → Retrying ESM without splitting...');
  clean();
  try {
    execSync(
      [...baseArgs, '--format=esm', '--target=chrome90'].join(' '),
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_PATH: join(ROOT, 'node_modules') } }
    );
    console.log('  ✓ ESM build succeeded');
  } catch {
    // Try 3: IIFE with banner shim
    console.log('  → Retrying IIFE with import.meta shim...');
    clean();
    execSync(
      [...baseArgs, '--format=iife', '--target=chrome90', `--banner:js=${banner}`].join(' '),
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_PATH: join(ROOT, 'node_modules') } }
    );
    console.log('  ✓ IIFE build succeeded');
  }
}

// Find generated files
const assets = readdirSync(join(DIST, 'assets'));
const jsFiles = assets.filter(f => f.endsWith('.js') && !f.endsWith('.js.map'));
const cssFile = assets.find(f => f.endsWith('.css') && !f.endsWith('.css.map'));
const mainJs = jsFiles.find(f => f.startsWith('main')) || jsFiles[0];

console.log(`  → JS: ${jsFiles.join(', ')}`);
console.log(`  → CSS: ${cssFile || 'none'}`);

// Generate index.html
const isEsm = !mainJs || true; // always use type=module for ESM-safe fallback
const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Skill Evaluator - AI Skill 质量评估工具</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%236366f1'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-size='18' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E" />
    ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}" />` : ''}
  </head>
  <body>
    <div id="root"></div>
    ${mainJs ? `<script type="module" src="/assets/${mainJs}"></script>` : '<!-- ERROR: no JS bundle found -->'}
  </body>
</html>`;

writeFileSync(join(DIST, 'index.html'), html);

// Copy public assets
const publicDir = join(ROOT, 'public');
if (existsSync(publicDir)) {
  for (const f of readdirSync(publicDir)) {
    copyFileSync(join(publicDir, f), join(DIST, f));
  }
}

console.log(`\n✅ Build complete → dist/index.html`);
