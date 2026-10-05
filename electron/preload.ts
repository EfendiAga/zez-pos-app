import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  saveAutoBackup: (backupJson: string) => ipcRenderer.invoke('save-auto-backup', backupJson),
  getBackupInfo: () => ipcRenderer.invoke('get-backup-info'),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
  onUpdateAvailable: (callback: (info: any) => void) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateDownloaded: (callback: (info: any) => void) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  onUpdateError: (callback: (error: string) => void) => ipcRenderer.on('update-error', (_event, error) => callback(error)),
  installUpdate: () => ipcRenderer.send('install-update'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
});
