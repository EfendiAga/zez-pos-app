import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { startBridgeServer } from '../server/fiscalBridge';

let mainWindow: BrowserWindow | null = null;
let bridgeServer: any = null;

// Backup directory inside user's Documents
const getBackupDirectory = () => {
  const dir = path.join(app.getPath('documents'), 'ZEZ-POS-Backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'ZEZ-POS',
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#09090b',
    icon: path.join(__dirname, '../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // IPC controls for window actions
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow?.close());
  ipcMain.on('window-toggle-fullscreen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // Hourly Auto-Backup IPC handlers
  ipcMain.handle('save-auto-backup', async (_event, backupJson: string) => {
    try {
      const backupDir = getBackupDirectory();
      const currentFile = path.join(backupDir, 'zez-pos-auto-backup.json');
      fs.writeFileSync(currentFile, backupJson, 'utf-8');

      // Also write hourly history copy
      const now = new Date();
      const historyDir = path.join(backupDir, 'history');
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }
      const hourStr = now.getHours().toString().padStart(2, '0');
      const histFile = path.join(historyDir, `backup_${now.toISOString().slice(0, 10)}_${hourStr}h.json`);
      fs.writeFileSync(histFile, backupJson, 'utf-8');

      return { success: true, path: currentFile, lastSaved: now.toISOString() };
    } catch (err: any) {
      console.error('[Electron] Failed to write auto-backup:', err);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('get-backup-info', async () => {
    try {
      const backupDir = getBackupDirectory();
      const currentFile = path.join(backupDir, 'zez-pos-auto-backup.json');
      if (fs.existsSync(currentFile)) {
        const stat = fs.statSync(currentFile);
        return { exists: true, path: currentFile, lastSaved: stat.mtime.toISOString(), folder: backupDir };
      }
      return { exists: false, path: currentFile, lastSaved: null, folder: backupDir };
    } catch {
      return { exists: false, path: null, lastSaved: null };
    }
  });

  ipcMain.handle('open-backup-folder', async () => {
    try {
      const backupDir = getBackupDirectory();
      await shell.openPath(backupDir);
      return true;
    } catch {
      return false;
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup Auto Updater
  if (!devUrl) {
    autoUpdater.autoDownload = false;
    
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-available', info);
    });
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update-downloaded', info);
    });
    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('update-error', err.message);
    });
    
    ipcMain.on('install-update', () => {
      autoUpdater.quitAndInstall();
    });
    ipcMain.on('check-for-updates', () => {
      autoUpdater.checkForUpdates();
    });
    ipcMain.on('download-update', () => {
      autoUpdater.downloadUpdate();
    });
    
    // Check for updates on startup
    autoUpdater.checkForUpdatesAndNotify();
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Start embedded fiscal bridge on port 8181
    try {
      bridgeServer = startBridgeServer(8181);
    } catch (err) {
      console.warn('[Electron] Fiscal bridge port already in use or active:', err);
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (bridgeServer && typeof bridgeServer.close === 'function') {
    try {
      bridgeServer.close();
    } catch {
      // ignore
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
