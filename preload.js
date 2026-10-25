const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  send: (ch, d) => ipcRenderer.send(ch, d),
  invoke: (ch, d) => ipcRenderer.invoke(ch, d),
  on: (ch, fn) => { const h = (_, d) => fn(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); }
});
