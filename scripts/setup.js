#!/usr/bin/env node
// Runs after `npm install`. Copies the browser builds of the speech engine and the
// Word-file reader, plus the Geist fonts, into app/, then fetches the built-in voice model.
// Nothing here is committed to git: it all comes from npm packages or the model download.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');

const copies = [
  ['vosk-browser/dist/vosk.js', 'app/vendor/vosk.js'],
  ['mammoth/mammoth.browser.min.js', 'app/vendor/mammoth.browser.min.js'],
  ['@fontsource/geist/files/geist-latin-400-normal.woff2', 'app/fonts/geist-latin-400-normal.woff2'],
  ['@fontsource/geist/files/geist-latin-500-normal.woff2', 'app/fonts/geist-latin-500-normal.woff2'],
  ['@fontsource/geist/files/geist-latin-600-normal.woff2', 'app/fonts/geist-latin-600-normal.woff2'],
  ['@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2', 'app/fonts/geist-mono-latin-400-normal.woff2'],
  ['@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2', 'app/fonts/geist-mono-latin-500-normal.woff2']
];

let missing = 0;
for (const [from, to] of copies) {
  const src = path.join(nm, from), dst = path.join(root, to);
  if (!fs.existsSync(src)) { console.warn(`[eyeline] missing ${from}; run npm install`); missing++; continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
console.log(`[eyeline] copied ${copies.length - missing} vendor files into app/`);

// The voice model is optional for development: without it, the app downloads it the first time
// you press Start. A failed download here never fails the install.
require('./fetch-model').ensureModel().catch(e => {
  console.warn(`[eyeline] couldn't fetch the voice model now (${e.message}). Run "npm run fetch-model" later, or let the app download it on first use.`);
});
