/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { db } from './lib/db';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { POS } from './components/POS';
import { Kitchen } from './components/Kitchen';
import { SetupBusiness } from './components/SetupBusiness';
import { Business } from './types';
import { Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { backupService } from './lib/backupService';
import { useI18n } from './lib/i18n';

function AppContent() {
  const { profile, effectiveProfile, loading, hasOwnerAccount } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoading, setBusinessLoading] = useState(false);

  // Automated Hourly Background Backup
  useEffect(() => {
    if (!hasOwnerAccount) return;

    // Initial auto-backup 15s after startup
    const initialTimer = setTimeout(() => {
      backupService.runAutoBackup().catch((err) => {
        console.warn('[Auto-Backup] Initial backup attempt failed:', err);
      });
    }, 15000);

    // Recurring auto-backup every 60 minutes
    const HOURLY_INTERVAL = 60 * 60 * 1000;
    const hourlyTimer = setInterval(() => {
      backupService.runAutoBackup().catch((err) => {
        console.warn('[Auto-Backup] Hourly backup failed:', err);
      });
    }, HOURLY_INTERVAL);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(hourlyTimer);
    };
  }, [hasOwnerAccount]);

  const { t, language } = useI18n();

  // Auto-Updater Notifications
  useEffect(() => {
    if (window.electron?.onUpdateAvailable) {
      window.electron.onUpdateAvailable(() => {
        toast.info(language === 'mk' ? 'Достапна е нова верзија.' : 'A new update is available.', {
          action: {
            label: language === 'mk' ? 'Преземи' : 'Download',
            onClick: () => {
              toast.loading(language === 'mk' ? 'Преземање на ажурирањето...' : 'Downloading update...', { id: 'update-dl' });
              window.electron.downloadUpdate();
            }
          },
          duration: 20000,
        });
      });
      window.electron.onUpdateDownloaded(() => {
        toast.dismiss('update-dl');
        toast.success(language === 'mk' ? 'Ажурирањето е преземено! Ќе се инсталира на следното стартување.' : 'Update downloaded! It will install on next restart.', {
          action: {
            label: language === 'mk' ? 'Рестартирај сега' : 'Restart Now',
            onClick: () => window.electron.installUpdate()
          },
          duration: 20000,
        });
      });
      window.electron.onUpdateError((err: string) => {
        toast.dismiss('update-dl');
        toast.error(language === 'mk' ? 'Грешка при ажурирање: ' + err : 'Update error: ' + err);
      });
    }
  }, [language]);

  useEffect(() => {
    if (!profile?.businessId) {
      setBusiness(null);
      setBusinessLoading(false);
      return;
    }

    setBusinessLoading(true);
    db.businesses.get(profile.businessId).then((b: Business) => {
      setBusiness(b || null);
      setBusinessLoading(false);
    }).catch(() => {
      setBusiness(null);
      setBusinessLoading(false);
    });
  }, [profile?.businessId]);

  if (loading || businessLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  // If there's no owner account at all, they MUST go to Setup Business first
  if (!hasOwnerAccount) {
    return <SetupBusiness />;
  }

  // If there's an owner account but no active profile, show Login (PIN screen)
  if (!profile) {
    return <Login />;
  }

  const activeRole = effectiveProfile?.role || profile?.role || 'owner';

  switch (activeRole) {
    case 'owner':
    case 'admin':
    case 'manager':
    case 'cashier':
      return <Dashboard />;
    case 'waiter':
      return <POS />;
    case 'kitchen':
      return <Kitchen />;
    default:
      return <Dashboard />;
  }
}

import { I18nProvider } from './lib/i18n';

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppContent />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </I18nProvider>
  );
}
