const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('polyblueDesktop', {
  platform: process.platform,
  versions: process.versions
});
