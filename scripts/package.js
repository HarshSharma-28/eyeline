#!/usr/bin/env node
// Builds Eyeline for one or more platforms into dist/.
//   node scripts/package.js win | mac | linux | all
// Windows builds get Eyeline's icon and version info written into the .exe.
// macOS builds are unsigned; see build/readme/mac.txt for the one-line unblock on a Mac.
// If the `zip`/`tar` commands exist, each build is also archived for release.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const pkg = require('../package.json');

const TARGETS = {
  win: [{ platform: 'win32', arch: 'x64', readme: 'windows.txt', archive: 'Eyeline-Windows.zip' }],
  mac: [
    { platform: 'darwin', arch: 'arm64', readme: 'mac.txt', archive: 'Eyeline-Mac-AppleSilicon.zip' },
    { platform: 'darwin', arch: 'x64', readme: 'mac.txt', archive: 'Eyeline-Mac-Intel.zip' }
  ],
  linux: [{ platform: 'linux', arch: 'x64', readme: 'linux.txt', archive: 'Eyeline-Linux-x64.tar.gz' }]
};

const has = cmd => { try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };

async function build(t) {
  const opts = {
    dir: root, out: dist, overwrite: true, name: 'Eyeline',
    platform: t.platform, arch: t.arch, appVersion: pkg.version,
    asar: { unpack: '**/models/**' },
    ignore: [/^\/dist($|\/)/, /^\/docs($|\/)/, /^\/scripts($|\/)/, /^\/build($|\/)/, /^\/\.git/]
  };
  if (t.platform === 'darwin') Object.assign(opts, { icon: path.join(root, 'build/icon.icns'), appBundleId: 'app.eyeline.prompter', extendInfo: path.join(root, 'build/mac-info.plist') });
  if (t.platform === 'linux') opts.icon = path.join(root, 'build/icon-512.png');
  if (!fs.existsSync(path.join(root, 'models', 'vosk-model-small-en-us-0.15.tar.gz'))) console.warn('[eyeline] no voice model in models/: this build will download it on first use (run "npm run fetch-model" to bundle it).');

  const [outDir] = await packager(opts);
  fs.copyFileSync(path.join(root, 'build/readme', t.readme), path.join(outDir, 'READ ME FIRST.txt'));
  if (t.platform === 'win32') execFileSync(process.execPath, [path.join(__dirname, 'set-exe-info.js'), path.join(outDir, 'Eyeline.exe'), path.join(root, 'build/icon.ico')], { stdio: 'inherit' });
  if (t.platform === 'linux') { const s = path.join(outDir, 'eyeline.sh'); fs.copyFileSync(path.join(root, 'build/eyeline.sh'), s); fs.chmodSync(s, 0o755); }
  // On a Mac, ad-hoc sign the bundle so Apple Silicon will run it (elsewhere, users sign it once; see build/readme/mac.txt).
  if (t.platform === 'darwin' && process.platform === 'darwin') execFileSync('codesign', ['--force', '--deep', '--sign', '-', path.join(outDir, 'Eyeline.app')], { stdio: 'inherit' });

  const archive = path.join(dist, t.archive);
  fs.rmSync(archive, { force: true });
  const base = path.basename(outDir);
  if (t.archive.endsWith('.tar.gz') && has('tar')) execFileSync('tar', ['czf', archive, base], { cwd: dist });
  else if (t.archive.endsWith('.zip') && has('zip')) execFileSync('zip', ['-qry', '-9', archive, base], { cwd: dist }); // -y keeps the symlinks macOS frameworks need
  else { console.log(`[eyeline] built ${base} (no zip/tar found, skipped the archive)`); return; }
  console.log(`[eyeline] ${t.archive} ready`);
}

(async () => {
  const which = process.argv[2] || 'all';
  const list = which === 'all' ? [...TARGETS.win, ...TARGETS.mac, ...TARGETS.linux] : TARGETS[which];
  if (!list) { console.error('Usage: node scripts/package.js win|mac|linux|all'); process.exit(1); }
  for (const t of list) await build(t);
})().catch(e => { console.error(e); process.exit(1); });
