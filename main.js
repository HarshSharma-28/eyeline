// Eyeline — floating teleprompter overlay for Windows.
// Control window: script + settings. Overlay window: frameless, transparent,
// always on top, click-through text that moves as you speak.
const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, net, shell, systemPreferences } = require('electron');
const IS_MAC = process.platform === 'darwin', IS_LINUX = process.platform === 'linux';
// The overlay positions itself and stays on top, which Wayland doesn't allow apps to do; run through X11 (XWayland) instead.
if (IS_LINUX) app.commandLine.appendSwitch('ozone-platform', 'x11');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { MODELS, tarGzFromZip } = require('./models');

if (process.platform === 'win32') app.setAppUserModelId('app.eyeline.prompter');
if (!app.requestSingleInstanceLock()) { app.quit(); }

// Optional diagnostics: create "debug.flag" next to Eyeline.exe to write eyeline-debug.log there.
const EXE_DIR = path.dirname(process.execPath);
const DEBUG = fs.existsSync(path.join(EXE_DIR, 'debug.flag'));
function dlog(...a) { if (!DEBUG) return; try { fs.appendFileSync(path.join(EXE_DIR, 'eyeline-debug.log'), new Date().toISOString().slice(11, 23) + ' ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); } catch (e) {} }
ipcMain.on('log', (_, m) => dlog('[overlay]', m));
const USER = () => app.getPath('userData');
const STATE_FILE = () => path.join(USER(), 'state.json');
const MODEL_DIR = () => path.join(USER(), 'models');
const BUNDLED_MODELS = path.join(__dirname, 'models');
const APP_DIR = path.join(__dirname, 'app');
const ICON = path.join(__dirname, 'app', 'icon.png');

const DEFAULTS = {
  drive: 'voice', mode: 'scroll', lang: 'en-us', lockScript: true,
  wpm: 140, size: 32, width: 760, lines: 3, plen: 4, bg: 90,
  clickThrough: true, protect: true, shadow: true, compact: false, textFirst: false,
  overlayX: null, overlayY: null
};
let state = { settings: { ...DEFAULTS }, script: null };
try { const s = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); state = { settings: { ...DEFAULTS, ...s.settings }, script: s.script ?? null }; } catch (e) {}
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.mkdirSync(USER(), { recursive: true }); fs.writeFileSync(STATE_FILE(), JSON.stringify(state)); } catch (e) {} }, 300); }

let control = null, overlay = null, port = 0, overlayH = 200;

// ---------- local server: app pages + speech models (same origin, so the speech worker can fetch models) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.gz': 'application/gzip', '.json': 'application/json', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let file = null;
      if (url.startsWith('/models/')) {
        const name = path.basename(url);
        const a = path.join(MODEL_DIR(), name), b = path.join(BUNDLED_MODELS, name);
        file = fs.existsSync(a) ? a : (fs.existsSync(b) ? b : null);
      } else {
        const p = path.normalize(path.join(APP_DIR, url === '/' ? 'control.html' : url));
        if (p.startsWith(APP_DIR) && fs.existsSync(p) && fs.statSync(p).isFile()) file = p;
      }
      if (!file) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => { port = srv.address().port; resolve(); });
  });
}
const pageUrl = p => `http://127.0.0.1:${port}/${p}`;

// ---------- windows ----------
function createControl() {
  control = new BrowserWindow({
    width: 1120, height: 780, minWidth: 760, minHeight: 560, title: 'Eyeline',
    backgroundColor: '#0a0a0c', icon: ICON, autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  control.loadURL(pageUrl('control.html'));
  control.setContentProtection(!!state.settings.protect);
  control.once('ready-to-show', () => control.show());
  control.webContents.on('did-finish-load', () => toControl('overlay-visible', !!(overlay && overlay.isVisible())));
  control.on('closed', () => { control = null; app.quit(); });
  control.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function overlayBounds(h) {
  const S = state.settings;
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.max(600, Math.min(wa.width, S.width + 40)); // +40: room for the floating shadows
  let x = S.overlayX, y = S.overlayY;
  if (x == null || y == null) { x = Math.round(wa.x + wa.width / 2 - w / 2); y = wa.y + 2; }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
function createOverlay() {
  overlay = new BrowserWindow({
    ...overlayBounds(overlayH),
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
    maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    show: false, icon: ICON, title: 'Eyeline overlay',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // On a Mac, also float above full-screen apps (e.g. a full-screen Zoom or Keynote window).
  overlay.setVisibleOnAllWorkspaces(true, IS_MAC ? { visibleOnFullScreen: true } : undefined);
  applyOverlayFlags();
  overlay.loadURL(pageUrl('overlay.html'));
  overlay.webContents.on('did-finish-load', () => {
    overlay.webContents.send('init', { settings: state.settings, script: state.script });
    showOverlay(true);
  });
  overlay.on('moved', () => {
    const b = overlay.getBounds(); state.settings.overlayX = b.x; state.settings.overlayY = b.y; save();
  });
  overlay.on('closed', () => { overlay = null; });
}
function applyOverlayFlags() {
  const S = state.settings;
  // Hidden from screen recording, screenshots and screen sharing; still visible to you.
  if (control && !control.isDestroyed()) control.setContentProtection(!!S.protect);
  if (!overlay) return;
  overlay.setContentProtection(!!S.protect);
  ignoring = null; // the hit-test loop below applies click-through on its next tick
}
function showOverlay(show) {
  if (!overlay) return;
  if (show) { overlay.showInactive(); overlay.setAlwaysOnTop(true, 'screen-saver'); } else overlay.hide();
  toControl('overlay-visible', show);
}
const toControl = (ch, d) => control && !control.isDestroyed() && control.webContents.send(ch, d);
const toOverlay = (ch, d) => overlay && !overlay.isDestroyed() && overlay.webContents.send(ch, d);

// ---------- IPC ----------
ipcMain.handle('get-state', () => ({ settings: state.settings, script: state.script, models: modelList() }));
ipcMain.on('set-script', (_, text) => { state.script = text; save(); toOverlay('script', text); });
ipcMain.on('set-settings', (_, s) => {
  const prev = state.settings;
  state.settings = { ...prev, ...s }; save();
  applyOverlayFlags();
  if (overlay && s.width != null && s.width !== prev.width) {
    const b = overlay.getBounds(); const c = b.x + b.width / 2;
    const nb = overlayBounds(b.height); nb.x = Math.round(c - nb.width / 2); nb.y = b.y;
    overlay.setBounds(nb);
  }
  toOverlay('settings', state.settings);
  if (overlay && _.sender === overlay.webContents) toControl('settings', state.settings);
});
ipcMain.on('cmd', (_, c) => {
  if (c === 'show') showOverlay(true);
  else if (c === 'hide') showOverlay(false);
  else if (c === 'reset-position') {
    state.settings.overlayX = null; state.settings.overlayY = null; save();
    if (overlay) overlay.setBounds(overlayBounds(overlay.getBounds().height));
    showOverlay(true);
  } else if (c === 'focus-control') { if (control) { control.show(); control.focus(); } }
  else { if (c === 'play' || c === 'toggle') showOverlay(true); toOverlay('cmd', c); }
});
// The overlay reports the size it needs and the size it actually got. Windows at fractional
// display scaling can hand back a smaller window than requested, so correct by the difference.
let fitTries = 0, fitReset = 0;
ipcMain.on('overlay-fit', (_, d) => {
  if (!overlay || overlay.isDestroyed()) return;
  const dw = Math.round(d.needW - d.innerW), dh = Math.round(d.needH - d.innerH);
  if (Math.abs(dw) <= 1 && Math.abs(dh) <= 1) { fitTries = 0; return; }
  const now = Date.now(); if (now - fitReset > 2000) { fitTries = 0; fitReset = now; }
  if (++fitTries > 10) return; // never loop forever if Windows refuses a size
  const b = overlay.getBounds();
  const nb = { x: Math.round(b.x - dw / 2), y: b.y, width: Math.max(320, b.width + dw), height: Math.max(60, b.height + dh) };
  overlayH = nb.height;
  if (drag) { drag.w = nb.width; drag.h = nb.height; drag.x += nb.x - b.x; nb.x = b.x + (nb.x - b.x); }
  overlay.setBounds(nb);
});
// ---------- moving the overlay: follow the real cursor while the move handle is held ----------
let drag = null;
function endDrag(why) {
  if (!drag) return;
  dlog('drag-end', why || '', 'ticks', drag.ticks);
  clearInterval(drag.timer); drag = null;
  if (overlay && !overlay.isDestroyed()) {
    const b = overlay.getBounds(); state.settings.overlayX = b.x; state.settings.overlayY = b.y; save();
  }
}
ipcMain.on('drag-start', () => {
  if (!overlay || overlay.isDestroyed()) return;
  endDrag('restart');
  setIgnore(false);
  const c = screen.getCursorScreenPoint(), b = overlay.getBounds();
  drag = { cx: c.x, cy: c.y, x: b.x, y: b.y, w: b.width, h: b.height, started: Date.now(), lx: b.x, ly: b.y, ticks: 0 };
  dlog('drag-start cursor', c, 'bounds', b);
  drag.timer = setInterval(() => {
    if (!overlay || overlay.isDestroyed() || Date.now() - drag.started > 120000) return endDrag('timeout');
    const p = screen.getCursorScreenPoint();
    // keep the control bar reachable on whichever screen the cursor is on
    const wa = screen.getDisplayNearestPoint(p).workArea;
    let nx = drag.x + (p.x - drag.cx), ny = drag.y + (p.y - drag.cy);
    nx = Math.min(Math.max(nx, wa.x - drag.w + 200), wa.x + wa.width - 200);
    ny = Math.min(Math.max(ny, wa.y - 4), wa.y + wa.height - 70);
    nx = Math.round(nx); ny = Math.round(ny);
    if (nx === drag.lx && ny === drag.ly) return;
    drag.lx = nx; drag.ly = ny; drag.ticks++;
    if (drag.ticks <= 3 || drag.ticks % 20 === 0) dlog('drag move', p, '->', nx, ny);
    overlay.setBounds({ x: nx, y: ny, width: drag.w, height: drag.h });
  }, 8);
});
ipcMain.on('drag-end', (_, why) => endDrag(why));
// ---------- click-through by cursor position ----------
// The overlay reports where its bars (always clickable) and script panel are. Several times a second
// we check the real cursor against them: over a bar the window takes clicks, anywhere else they pass
// through to the app underneath. This doesn't depend on hover events, which Windows reports
// unreliably for click-through windows.
let hit = { bars: [], panel: null }, ignoring = null;
function setIgnore(v) {
  if (!overlay || overlay.isDestroyed() || ignoring === v) return;
  ignoring = v;
  overlay.setIgnoreMouseEvents(v, { forward: true });
  dlog('click-through', v);
}
ipcMain.on('hit-rects', (_, r) => { hit = r || { bars: [], panel: null }; });
const inRect = (x, y, r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
setInterval(() => {
  if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
  if (drag) return setIgnore(false);
  const p = screen.getCursorScreenPoint(), b = overlay.getContentBounds();
  const x = p.x - b.x, y = p.y - b.y;
  const overBar = hit.bars.some(r => inRect(x, y, r));
  const overPanel = !state.settings.clickThrough && inRect(x, y, hit.panel);
  setIgnore(!(overBar || overPanel));
}, 30);
ipcMain.on('status', (_, st) => toControl('status', st));
// macOS asks the person once before any app can use the microphone.
ipcMain.handle('mic-access', async () => {
  if (!IS_MAC) return true;
  const st = systemPreferences.getMediaAccessStatus('microphone');
  if (st === 'granted') return true;
  if (st === 'not-determined') return systemPreferences.askForMediaAccess('microphone');
  return false;
});

// ---------- speech models ----------
function modelPath(lang) {
  const m = MODELS[lang]; if (!m) return null;
  const a = path.join(MODEL_DIR(), m.file), b = path.join(BUNDLED_MODELS, m.file);
  return fs.existsSync(a) ? a : (fs.existsSync(b) ? b : null);
}
function modelList() { return Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, { label: m.label, ready: !!modelPath(k) }])); }
const downloading = {};
ipcMain.handle('model-ensure', async (_, lang) => {
  const m = MODELS[lang]; if (!m) throw new Error('Unknown language');
  if (modelPath(lang)) return `/models/${m.file}`;
  if (!downloading[lang]) downloading[lang] = (async () => {
    const report = (pct, phase) => { toControl('model-progress', { lang, pct, phase }); toOverlay('model-progress', { lang, pct, phase }); };
    report(0, 'download');
    const res = await net.fetch(m.zip);
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const total = +res.headers.get('content-length') || 0;
    const reader = res.body.getReader(); const chunks = []; let got = 0, lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      chunks.push(Buffer.from(value)); got += value.length;
      const pct = total ? Math.floor(got / total * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; report(pct, 'download'); }
    }
    report(100, 'unpack');
    const tgz = tarGzFromZip(Buffer.concat(chunks));
    fs.mkdirSync(MODEL_DIR(), { recursive: true });
    const tmp = path.join(MODEL_DIR(), m.file + '.part');
    fs.writeFileSync(tmp, tgz); fs.renameSync(tmp, path.join(MODEL_DIR(), m.file));
    report(100, 'ready');
    toControl('models', modelList());
  })().finally(() => { delete downloading[lang]; });
  await downloading[lang];
  return `/models/${m.file}`;
});

// ---------- global shortcuts (work while you're in your recording app) ----------
function registerShortcuts() {
  const map = {
    'CommandOrControl+Shift+Space': () => { showOverlay(true); toOverlay('cmd', 'toggle'); },
    'CommandOrControl+Shift+Up': () => toOverlay('cmd', 'back'),
    'CommandOrControl+Shift+Down': () => toOverlay('cmd', 'forward'),
    'CommandOrControl+Shift+Right': () => toOverlay('cmd', 'faster'),
    'CommandOrControl+Shift+Left': () => toOverlay('cmd', 'slower'),
    'CommandOrControl+Shift+R': () => toOverlay('cmd', 'restart'),
    'CommandOrControl+Shift+H': () => overlay && showOverlay(!overlay.isVisible()),
    'CommandOrControl+Shift+E': () => { if (control) { if (control.isMinimized()) control.restore(); control.show(); control.focus(); } },
    'CommandOrControl+Shift+L': () => { state.settings.clickThrough = !state.settings.clickThrough; save(); applyOverlayFlags(); toOverlay('settings', state.settings); toControl('settings', state.settings); }
  };
  for (const [k, fn] of Object.entries(map)) { try { globalShortcut.register(k, fn); } catch (e) {} }
}

app.whenReady().then(async () => {
  dlog('--- Eyeline start', process.versions.electron, 'scale', screen ? '' : '');
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media');
  await startServer();
  createControl();
  createOverlay();
  registerShortcuts();
});
app.on('second-instance', () => { if (control) { if (control.isMinimized()) control.restore(); control.focus(); } });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
