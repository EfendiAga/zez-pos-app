import { dexieDb } from './db';

export interface BackupData {
  app: 'ZEZ-POS';
  version: string;
  exportedAt: string;
  businessName?: string;
  data: {
    users: any[];
    businesses: any[];
    diningTables: any[];
    products: any[];
    categories: any[];
    orders: any[];
    transactions: any[];
    customers: any[];
    shifts: any[];
    staffInvites: any[];
    parkedOrders: any[];
  };
}

export const backupService = {
  /**
   * Generates the serialized BackupData structure from Dexie tables.
   */
  async generateBackupData(): Promise<BackupData> {
    const [
      users,
      businesses,
      diningTables,
      products,
      categories,
      orders,
      transactions,
      customers,
      shifts,
      staffInvites,
      parkedOrders
    ] = await Promise.all([
      dexieDb.users.toArray(),
      dexieDb.businesses.toArray(),
      dexieDb.diningTables.toArray(),
      dexieDb.products.toArray(),
      dexieDb.categories.toArray(),
      dexieDb.orders.toArray(),
      dexieDb.transactions.toArray(),
      dexieDb.customers.toArray(),
      dexieDb.shifts.toArray(),
      dexieDb.staffInvites.toArray(),
      dexieDb.parkedOrders.toArray()
    ]);

    const business = businesses[0];
    const businessName = business?.name || 'Store';

    return {
      app: 'ZEZ-POS',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      businessName,
      data: {
        users,
        businesses,
        diningTables,
        products,
        categories,
        orders,
        transactions,
        customers,
        shifts,
        staffInvites,
        parkedOrders
      }
    };
  },

  /**
   * Export entire Dexie database to a downloadable JSON file.
   */
  async exportBackup(): Promise<void> {
    const backup = await this.generateBackupData();
    const businessName = backup.businessName || 'Store';
    const dateStr = new Date().toISOString().slice(0, 10);

    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanName = businessName.replace(/[^a-zA-Z0-9_\u0400-\u04FF-]/g, '_');
    link.download = `ZEZ-POS_Backup_${cleanName}_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Automatically executes hourly backup without user interruption.
   * In Electron: saves directly to Documents/ZEZ-POS-Backups/zez-pos-auto-backup.json and history folder.
   * In Browser/localhost: saves snapshot to browser localStorage.
   */
  async runAutoBackup(): Promise<{ success: boolean; path?: string; lastSaved?: string; error?: string }> {
    try {
      const backup = await this.generateBackupData();
      const jsonString = JSON.stringify(backup, null, 2);

      if (typeof window !== 'undefined' && (window as any).electron?.saveAutoBackup) {
        const result = await (window as any).electron.saveAutoBackup(jsonString);
        if (result.success) {
          localStorage.setItem('zez_last_auto_backup', result.lastSaved || new Date().toISOString());
          console.log('[Auto-Backup] Hourly snapshot saved to disk:', result.path);
          return { success: true, path: result.path, lastSaved: result.lastSaved };
        } else {
          console.warn('[Auto-Backup] Electron save error:', result.error);
          return { success: false, error: result.error };
        }
      } else {
        const nowIso = new Date().toISOString();
        if (typeof window !== 'undefined') {
          localStorage.setItem('zez_browser_auto_backup', jsonString);
          localStorage.setItem('zez_last_auto_backup', nowIso);
        }
        console.log('[Auto-Backup] Saved to browser storage');
        return { success: true, path: 'Browser Storage', lastSaved: nowIso };
      }
    } catch (err: any) {
      console.error('[Auto-Backup] Failed to run auto backup:', err);
      return { success: false, error: err?.message || 'Unknown error' };
    }
  },

  /**
   * Retrieves info regarding the last auto-backup.
   */
  async getAutoBackupInfo(): Promise<{ exists: boolean; path: string | null; lastSaved: string | null; folder?: string }> {
    if (typeof window !== 'undefined' && (window as any).electron?.getBackupInfo) {
      try {
        return await (window as any).electron.getBackupInfo();
      } catch (err) {
        console.warn('[Auto-Backup] Failed to query backup info from electron:', err);
      }
    }

    const lastSaved = typeof window !== 'undefined' ? localStorage.getItem('zez_last_auto_backup') : null;
    return {
      exists: !!lastSaved,
      path: typeof window !== 'undefined' && (window as any).electron?.isElectron ? 'zez-pos-auto-backup.json' : 'Browser Storage',
      lastSaved
    };
  },

  /**
   * Opens the backup directory in Windows Explorer (Electron only).
   */
  async openBackupFolder(): Promise<boolean> {
    if (typeof window !== 'undefined' && (window as any).electron?.openBackupFolder) {
      return await (window as any).electron.openBackupFolder();
    }
    return false;
  },

  /**
   * Import and restore data from a JSON backup file.
   */
  async importBackup(file: File): Promise<{ success: boolean; message: string; businessName?: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          if (!content) {
            return resolve({ success: false, message: 'The selected backup file is empty.' });
          }

          const parsed: BackupData = JSON.parse(content);
          if (!parsed || !parsed.data || typeof parsed.data !== 'object') {
            return resolve({ success: false, message: 'Invalid backup format. Missing data structure.' });
          }

          const {
            users = [],
            businesses = [],
            diningTables = [],
            products = [],
            categories = [],
            orders = [],
            transactions = [],
            customers = [],
            shifts = [],
            staffInvites = [],
            parkedOrders = []
          } = parsed.data;

          // Perform atomic transaction across all tables
          await dexieDb.transaction(
            'rw',
            [
              dexieDb.users,
              dexieDb.businesses,
              dexieDb.diningTables,
              dexieDb.products,
              dexieDb.categories,
              dexieDb.orders,
              dexieDb.transactions,
              dexieDb.customers,
              dexieDb.shifts,
              dexieDb.staffInvites,
              dexieDb.parkedOrders
            ],
            async () => {
              // 1. Clear existing data
              await Promise.all([
                dexieDb.users.clear(),
                dexieDb.businesses.clear(),
                dexieDb.diningTables.clear(),
                dexieDb.products.clear(),
                dexieDb.categories.clear(),
                dexieDb.orders.clear(),
                dexieDb.transactions.clear(),
                dexieDb.customers.clear(),
                dexieDb.shifts.clear(),
                dexieDb.staffInvites.clear(),
                dexieDb.parkedOrders.clear()
              ]);

              // 2. Populate restored data
              if (users.length > 0) await dexieDb.users.bulkPut(users);
              if (businesses.length > 0) await dexieDb.businesses.bulkPut(businesses);
              if (diningTables.length > 0) await dexieDb.diningTables.bulkPut(diningTables);
              if (products.length > 0) await dexieDb.products.bulkPut(products);
              if (categories.length > 0) await dexieDb.categories.bulkPut(categories);
              if (orders.length > 0) await dexieDb.orders.bulkPut(orders);
              if (transactions.length > 0) await dexieDb.transactions.bulkPut(transactions);
              if (customers.length > 0) await dexieDb.customers.bulkPut(customers);
              if (shifts.length > 0) await dexieDb.shifts.bulkPut(shifts);
              if (staffInvites.length > 0) await dexieDb.staffInvites.bulkPut(staffInvites);
              if (parkedOrders.length > 0) await dexieDb.parkedOrders.bulkPut(parkedOrders);
            }
          );

          resolve({
            success: true,
            message: 'Database restored successfully!',
            businessName: parsed.businessName || businesses[0]?.name
          });
        } catch (err: any) {
          console.error('Backup restore failed:', err);
          resolve({ success: false, message: err?.message || 'Failed to parse and restore backup.' });
        }
      };

      reader.onerror = () => {
        resolve({ success: false, message: 'Failed to read file from disk.' });
      };

      reader.readAsText(file);
    });
  }
};
