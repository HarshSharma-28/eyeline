#!/usr/bin/env node
// Downloads the built-in English (US) Vosk model into models/ as the .tar.gz layout
// vosk-browser loads. Tries this project's GitHub release first (already repacked), then
// falls back to the original zip from alphacephei.com and repacks it locally.
const fs = require('fs');
const path = require('path');
const { MODELS, tarGzFromZip } = require('../models');

const MODEL = MODELS['en-us'];
const OUT_DIR = path.join(__dirname, '..', 'models');
const OUT = path.join(OUT_DIR, MODEL.file);
const RELEASE_URL = `https://github.com/HarshSharma-28/eyeline/releases/download/voice-models/${MODEL.file}`;

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ensureModel({ force = false } = {}) {
  if (!force && fs.existsSync(OUT) && fs.statSync(OUT).size > 1e6) {
    console.log(`[eyeline] voice model already present: models/${MODEL.file}`);
    return OUT;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let data;
  try {
    console.log('[eyeline] downloading voice model (about 40 MB)…');
    data = await download(RELEASE_URL);
  } catch (e) {
    console.log(`[eyeline] release download failed (${e.message}); trying alphacephei.com…`);
    data = tarGzFromZip(await download(MODEL.zip));
  }
  if (data.length < 1e6) throw new Error('downloaded file is too small to be a model');
  fs.writeFileSync(OUT + '.part', data);
  fs.renameSync(OUT + '.part', OUT);
  console.log(`[eyeline] saved models/${MODEL.file} (${(data.length / 1e6).toFixed(1)} MB)`);
  return OUT;
}

module.exports = { ensureModel };

if (require.main === module) {
  ensureModel({ force: process.argv.includes('--force') }).catch(e => { console.error(`[eyeline] ${e.message}`); process.exit(1); });
}
