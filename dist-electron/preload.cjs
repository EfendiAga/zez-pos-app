// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  minimize: () => import_electron.ipcRenderer.send("window-minimize"),
  maximize: () => import_electron.ipcRenderer.send("window-maximize"),
  close: () => import_electron.ipcRenderer.send("window-close"),
  toggleFullscreen: () => import_electron.ipcRenderer.send("window-toggle-fullscreen"),
  saveAutoBackup: (backupJson) => import_electron.ipcRenderer.invoke("save-auto-backup", backupJson),
  getBackupInfo: () => import_electron.ipcRenderer.invoke("get-backup-info"),
  openBackupFolder: () => import_electron.ipcRenderer.invoke("open-backup-folder"),
  onUpdateAvailable: (callback) => import_electron.ipcRenderer.on("update-available", (_event, info) => callback(info)),
  onUpdateDownloaded: (callback) => import_electron.ipcRenderer.on("update-downloaded", (_event, info) => callback(info)),
  onUpdateError: (callback) => import_electron.ipcRenderer.on("update-error", (_event, error) => callback(error)),
  installUpdate: () => import_electron.ipcRenderer.send("install-update"),
  checkForUpdates: () => import_electron.ipcRenderer.send("check-for-updates"),
  downloadUpdate: () => import_electron.ipcRenderer.send("download-update")
});
