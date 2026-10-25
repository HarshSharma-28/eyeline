// Speech model management: bundled English (US) model, plus on-demand downloads
// of Vosk "small" models, repacked from .zip into the .tar.gz layout vosk-browser loads.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MODELS = {
  'en-us': {
    label: 'English (US accent)',
    file: 'vosk-model-small-en-us-0.15.tar.gz',
    bundled: true,
    zip: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'
  },
  'en-in': {
    label: 'English (Indian accent)',
    file: 'vosk-model-small-en-in-0.4.tar.gz',
    zip: 'https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip'
  },
  'hi': {
    label: 'Hindi',
    file: 'vosk-model-small-hi-0.22.tar.gz',
    zip: 'https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip'
  }
};

// ---- minimal ustar writer ----
function octal(n, len) { return n.toString(8).padStart(len - 1, '0') + '\0'; }
function header(name, size, type) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 99) {
    const i = name.lastIndexOf('/', 154);
    prefix = name.slice(0, i); name = name.slice(i + 1);
  }
  h.write(name, 0, 100, 'utf8');
  h.write(type === '5' ? '0000755\0' : '0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(octal(size, 12), 124);
  h.write(octal(Math.floor(Date.now() / 1000), 12), 136);
  h.fill(' ', 148, 156);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
// entries: [{name, data(Buffer|null for dir)}]
function makeTarGz(entries) {
  const parts = [];
  for (const e of entries) {
    if (e.data == null) { parts.push(header(e.name.replace(/\/?$/, '/'), 0, '5')); continue; }
    parts.push(header(e.name, e.data.length, '0'), e.data);
    const pad = (512 - (e.data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts), { level: 6 });
}
function entriesWithDirs(files) { // files: [{name, data}] (no dirs)
  const dirs = new Set();
  for (const f of files) { const p = f.name.split('/'); for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join('/')); }
  return [...[...dirs].sort().map(d => ({ name: d, data: null })), ...files];
}
function tarGzFromFolder(root, topName) {
  const files = [];
  (function walk(dir, rel) {
    for (const n of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, n), r = rel + '/' + n;
      if (fs.statSync(p).isDirectory()) walk(p, r); else files.push({ name: r, data: fs.readFileSync(p) });
    }
  })(root, topName);
  return makeTarGz(entriesWithDirs(files));
}
function tarGzFromZip(zipBuf) {
  const { unzipSync } = require('fflate');
  const out = unzipSync(new Uint8Array(zipBuf));
  const files = Object.keys(out).filter(k => !k.endsWith('/')).sort().map(k => ({ name: k, data: Buffer.from(out[k]) }));
  return makeTarGz(entriesWithDirs(files));
}

module.exports = { MODELS, makeTarGz, tarGzFromFolder, tarGzFromZip };
