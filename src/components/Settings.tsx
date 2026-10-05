import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { Business } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { 
  Building2, 
  Settings as SettingsIcon, 
  Printer, 
  Save, 
  RefreshCw, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Globe, 
  KeyRound,
  Database,
  Download,
  Upload,
  FolderOpen,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { fiscalService } from '../services/fiscalService';
import { useI18n } from '../lib/i18n';
import { backupService } from '../lib/backupService';

export function Settings() {
  const { profile } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const [business, setBusiness] = useState<Business | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; simulator: boolean; port: string; availablePorts: string[] } | null>(null);
  const [isCheckingPrinter, setIsCheckingPrinter] = useState(false);
  const [isTestingSlip, setIsTestingSlip] = useState(false);
  const [isPrintingReport, setIsPrintingReport] = useState(false);

  // Backup & Restore states
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [autoBackupInfo, setAutoBackupInfo] = useState<{ exists: boolean; path: string | null; lastSaved: string | null; folder?: string } | null>(null);
  const [isTriggeringAutoBackup, setIsTriggeringAutoBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAutoBackupInfo = async () => {
    try {
      const info = await backupService.getAutoBackupInfo();
      setAutoBackupInfo(info);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAutoBackupInfo();
  }, []);

  const handleManualAutoBackup = async () => {
    setIsTriggeringAutoBackup(true);
    toast.loading(language === 'mk' ? 'Се снима авто-резервна копија...' : 'Saving auto-backup snapshot...', { id: 'auto-bk' });
    try {
      const res = await backupService.runAutoBackup();
      if (res.success) {
        toast.success(
          language === 'mk' ? 'Успешно зачувана база во компјутерот!' : 'Database snapshot saved to PC!',
          { id: 'auto-bk' }
        );
        loadAutoBackupInfo();
      } else {
        toast.error(res.error || (language === 'mk' ? 'Грешка при зачувување' : 'Failed to save auto-backup'), { id: 'auto-bk' });
      }
    } catch (err: any) {
      toast.error(err.message || 'Auto-backup error', { id: 'auto-bk' });
    } finally {
      setIsTriggeringAutoBackup(false);
    }
  };

  const handleOpenFolder = async () => {
    const ok = await backupService.openBackupFolder();
    if (!ok) {
      toast.info(language === 'mk' ? 'Папката за резервни копии се наоѓа во Documents/ZEZ-POS-Backups' : 'Backups folder is located in Documents/ZEZ-POS-Backups');
    }
  };

  const formatBackupTime = (isoString?: string | null) => {
    if (!isoString) return language === 'mk' ? 'Подготвено (Се снима на секој час)' : 'Active (Saves every hour)';
    try {
      const date = new Date(isoString);
      return date.toLocaleString(language === 'mk' ? 'mk-MK' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // Operator PIN state
  const [operatorPin, setOperatorPin] = useState(profile?.pin || '');
  const [pinDigits, setPinDigits] = useState<4 | 6>((profile?.pin?.length === 6 ? 6 : 4) as 4 | 6);
  const [isSavingPin, setIsSavingPin] = useState(false);

  useEffect(() => {
    if (profile?.pin) {
      setOperatorPin(profile.pin);
      setPinDigits(profile.pin.length === 6 ? 6 : 4);
    }
  }, [profile?.pin]);

  const handleSavePin = async () => {
    if (!profile?.uid) return;
    if (operatorPin && operatorPin.length !== pinDigits) {
      toast.error(language === 'mk' ? `ПИН мора да има точно ${pinDigits} цифри` : `PIN must be exactly ${pinDigits} digits`);
      return;
    }
    setIsSavingPin(true);
    try {
      await db.users.update(profile.uid, { pin: operatorPin || '' });
      toast.success(operatorPin 
        ? (language === 'mk' ? `ПИН кодот (${pinDigits} цифри) е зачуван!` : `Operator PIN (${pinDigits} digits) updated!`)
        : (language === 'mk' ? 'ПИН кодот е отстранет' : 'PIN removed')
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update PIN');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleExportBackup = async () => {
    setIsExportingBackup(true);
    toast.loading(language === 'mk' ? 'Се подготвува резервна копија...' : 'Preparing database backup...', { id: 'backup-exp' });
    try {
      await backupService.exportBackup();
      toast.success(
        language === 'mk' ? 'Резервната копија е успешно симната (.json)!' : 'Database backup downloaded successfully (.json)!',
        { id: 'backup-exp' }
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to export backup', { id: 'backup-exp' });
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(
      language === 'mk'
        ? 'ВНИМАНИЕ: Враќањето на податоците ќе ги замени тековните артикли, цени, сметки и вработени со оние од резервната датотека. Дали сакате да продолжите?'
        : 'WARNING: Restoring will overwrite existing items, prices, sales, and staff with the data from this backup file. Do you want to continue?'
    )) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsRestoringBackup(true);
    toast.loading(language === 'mk' ? 'Се враќаат податоците...' : 'Restoring database...', { id: 'backup-imp' });
    try {
      const res = await backupService.importBackup(file);
      if (res.success) {
        toast.success(
          language === 'mk' ? 'Податоците се успешно вратени! Апликацијата ќе се освежи...' : 'Database restored! Refreshing app...',
          { id: 'backup-imp' }
        );
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        toast.error(res.message, { id: 'backup-imp' });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore backup', { id: 'backup-imp' });
    } finally {
      setIsRestoringBackup(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const checkPrinter = async () => {
    setIsCheckingPrinter(true);
    try {
      const status = await fiscalService.getStatus();
      setPrinterStatus(status);
    } catch {
      setPrinterStatus({ connected: false, simulator: true, port: 'Offline', availablePorts: [] });
    } finally {
      setIsCheckingPrinter(false);
    }
  };

  useEffect(() => {
    checkPrinter();
  }, []);

  const handleTestPrint = async () => {
    setIsTestingSlip(true);
    try {
      const res = await fiscalService.printTestSlip();
      if (res.success) {
        toast.success(res.message || (language === 'mk' ? 'Тест бонот е испечатен!' : 'Test slip printed!'));
      } else {
        toast.error(res.message || (language === 'mk' ? 'Неуспешно печатење на тест бон.' : 'Failed to print test slip.'));
      }
    } catch {
      toast.error(language === 'mk' ? 'Нема врска со фискалниот мост.' : 'Could not connect to fiscal bridge.');
    } finally {
      setIsTestingSlip(false);
    }
  };

  const handleDailyReport = async (type: 'Z' | 'X') => {
    const reportName = type === 'Z' ? t('settings.zReport') : t('settings.xReport');
    if (type === 'Z' && !window.confirm(language === 'mk' ? `Дали сте сигурни дека сакате да печатите ${reportName}? Ова го затвора работниот ден на касата.` : `Are you sure you want to print ${reportName}? This closes the business day on the fiscal register.`)) {
      return;
    }

    setIsPrintingReport(true);
    try {
      const res = await fiscalService.printDailyReport(type);
      if (res.success) {
        toast.success(`${reportName} ${language === 'mk' ? 'е успешно испечатен!' : 'printed successfully!'}`);
      } else {
        toast.error(res.message || `${language === 'mk' ? 'Неуспешно печатење на' : 'Failed to print'} ${reportName}.`);
      }
    } catch {
      toast.error(language === 'mk' ? 'Не може да се воспостави врска со фискалниот сервис.' : 'Could not connect to fiscal bridge.');
    } finally {
      setIsPrintingReport(false);
    }
  };

  const handleSelectPort = async (port: string) => {
    toast.loading(`${language === 'mk' ? 'Поврзување со' : 'Connecting to'} ${port}...`, { id: 'com-connect' });
    const res = await fiscalService.configurePort(port);
    if (res) {
      toast.success(`${language === 'mk' ? 'Портата е поставена на' : 'Port set to'} ${port}`, { id: 'com-connect' });
      checkPrinter();
    } else {
      toast.error(`${language === 'mk' ? 'Грешка при поврзување со' : 'Could not connect to'} ${port}`, { id: 'com-connect' });
    }
  };

  useEffect(() => {
    if (!profile?.businessId) return;
    db.businesses.get(profile.businessId).then((data: Business) => {
      setBusiness(data || null);
    });
  }, [profile?.businessId]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !business) return;

    setIsSaving(true);
    try {
      await db.businesses.update(profile.businessId, {
        name: business.name,
        settings: business.settings || {}
      });
      toast.success(t('common.saveSuccess'));
    } catch (error: any) {
      console.error("Update failed:", error);
      toast.error(`${language === 'mk' ? 'Грешка при зачувување' : 'Failed to update settings'}: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!business) return null;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-zinc-900 tracking-tight">{t('settings.title')}</h2>
          <p className="text-sm font-semibold text-zinc-500 mt-1 uppercase tracking-widest">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* Language Selection Card */}
      <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white transition-all">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50/80 rounded-2xl">
              <Globe className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">{t('settings.language')}</CardTitle>
              <CardDescription className="text-sm font-semibold mt-1">{t('settings.languageDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setLanguage('mk')}
              className={`p-4 rounded-2xl border-2 text-left flex items-center gap-3.5 transition-all ${
                language === 'mk'
                  ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 text-zinc-700'
              }`}
            >
              <span className="text-3xl">🇲🇰</span>
              <div>
                <p className="font-bold text-sm text-zinc-900">Македонски</p>
                <p className="text-xs text-zinc-500 font-medium">Северен стандарден јазик (МК)</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`p-4 rounded-2xl border-2 text-left flex items-center gap-3.5 transition-all ${
                language === 'en'
                  ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 text-zinc-700'
              }`}
            >
              <span className="text-3xl">🇬🇧</span>
              <div>
                <p className="font-bold text-sm text-zinc-900">English</p>
                <p className="text-xs text-zinc-500 font-medium">International POS Standard (EN)</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Security & Operator Quick PIN */}
      <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white transition-all">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50/80 rounded-2xl">
              <KeyRound className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">
                {language === 'mk' ? 'Брз ПИН Код за Каса' : 'Register Quick PIN'}
              </CardTitle>
              <CardDescription className="text-sm font-semibold mt-1">
                {language === 'mk'
                  ? 'Поставете 4 или 6 цифрен ПИН код за брза најава на продажната каса'
                  : 'Set a 4 or 6-digit PIN to switch operators quickly at checkout'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-md">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold text-zinc-700">
                {language === 'mk' ? 'Должина на ПИН Кодот' : 'PIN Format'}
              </Label>
              <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setPinDigits(4);
                    setOperatorPin((p) => p.slice(0, 4));
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    pinDigits === 4
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  4 {language === 'mk' ? 'Цифри' : 'Digits'}
                </button>
                <button
                  type="button"
                  onClick={() => setPinDigits(6)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    pinDigits === 6
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  6 {language === 'mk' ? 'Цифри' : 'Digits'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={pinDigits}
                value={operatorPin}
                onChange={(e) => setOperatorPin(e.target.value.replace(/\D/g, '').slice(0, pinDigits))}
                placeholder={pinDigits === 4 ? '••••' : '••••••'}
                className="h-12 text-center text-2xl tracking-widest font-mono rounded-2xl border-zinc-200"
              />
              <p className="text-xs text-zinc-400">
                {language === 'mk'
                  ? `Внесете точно ${pinDigits} цифри (оставете празно за да го отстраните ПИН кодот).`
                  : `Enter exactly ${pinDigits} digits (or leave blank to remove PIN).`}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleSavePin}
                disabled={isSavingPin}
                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-11 px-6 font-bold text-xs"
              >
                {isSavingPin ? t('common.saving') : (language === 'mk' ? 'Зачувај ПИН Код' : 'Save PIN')}
              </Button>
              {profile?.pin && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingPin}
                  onClick={async () => {
                    setOperatorPin('');
                    if (profile?.uid) {
                      setIsSavingPin(true);
                      try {
                        await db.users.update(profile.uid, { pin: '' });
                        toast.success(language === 'mk' ? 'ПИН кодот е отстранет' : 'PIN removed');
                      } finally {
                        setIsSavingPin(false);
                      }
                    }
                  }}
                  className="rounded-2xl h-11 border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold"
                >
                  {language === 'mk' ? 'Отстрани' : 'Remove'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 1-Click Database Backup & Restore with Hourly Auto-Backup */}
      <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white transition-all overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50/80 rounded-2xl">
                <Database className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">
                  {language === 'mk' ? 'Резервна Копија и Враќање на Податоци' : 'Database Backup & Restore'}
                </CardTitle>
                <CardDescription className="text-sm font-semibold mt-1">
                  {language === 'mk'
                    ? 'Автоматско снимање на секој час во компјутерот + рачен извоз за префрлување на друг PC'
                    : 'Automatic hourly saving to PC + manual export to move to another computer'}
                </CardDescription>
              </div>
            </div>
            {/* Live Auto-Backup Pulse Badge */}
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {language === 'mk' ? 'Автоматски секој 1 час' : 'Auto-Backup every 1 hr'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Automated Hourly Status Box */}
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-500" />
                <span className="text-xs font-bold text-zinc-800">
                  {language === 'mk' ? 'Локација на автоматска копија:' : 'Local Auto-Backup File:'}
                </span>
                <span className="text-xs font-mono bg-zinc-200/60 px-2 py-0.5 rounded text-zinc-700">
                  {autoBackupInfo?.path || 'Documents/ZEZ-POS-Backups/zez-pos-auto-backup.json'}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {language === 'mk' ? 'Последно автоматски зачувано: ' : 'Last automatically saved: '}
                <strong className="text-zinc-700">{formatBackupTime(autoBackupInfo?.lastSaved)}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenFolder}
                className="rounded-xl text-xs font-bold border-zinc-200 hover:bg-white text-zinc-700 flex items-center gap-1.5"
              >
                <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
                {language === 'mk' ? 'Отвори Папка' : 'Open Folder'}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleManualAutoBackup}
                disabled={isTriggeringAutoBackup}
                className="rounded-xl text-xs font-bold border-zinc-200 hover:bg-white text-zinc-700 flex items-center gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 ${isTriggeringAutoBackup ? 'animate-spin' : ''}`} />
                {language === 'mk' ? 'Сними Сега' : 'Backup Now'}
              </Button>
            </div>
          </div>

          {/* Manual 1-Click Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              onClick={handleExportBackup}
              disabled={isExportingBackup}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl h-12 px-6 font-bold text-xs shadow-md flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExportingBackup
                ? (language === 'mk' ? 'Се извезува...' : 'Exporting...')
                : (language === 'mk' ? 'Сними Резервна Копија на USB (.json)' : 'Export Database Backup to USB (.json)')}
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoringBackup}
              className="border-zinc-200 hover:bg-zinc-100 text-zinc-800 rounded-2xl h-12 px-6 font-bold text-xs shadow-xs flex items-center gap-2"
            >
              <Upload className="h-4 w-4 text-zinc-600" />
              {isRestoringBackup
                ? (language === 'mk' ? 'Се враќа...' : 'Restoring...')
                : (language === 'mk' ? 'Врати од Резервна Копија (.json)' : 'Restore from Backup (.json)')}
            </Button>
          </div>

          <p className="text-xs text-zinc-400">
            {language === 'mk'
              ? '💡 Забелешка: Апликацијата автоматски прави резервна копија секој час во вашиот компјутер. За префрлување на нов компјутер или лаптоп, само кликнете „Сними Резервна Копија на USB“ и на новиот уред кликнете „Врати од Резервна Копија“.'
              : '💡 Note: The app automatically backs up the database every hour to your PC. To move to a new computer or laptop, simply click "Export Database Backup to USB" and on the new machine click "Restore from Backup".'}
          </p>
        </CardContent>
      </Card>

      {/* System Updates */}
      <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white transition-all overflow-hidden mt-6">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50/80 rounded-2xl">
              <Download className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">
                {language === 'mk' ? 'Ажурирање на Системот' : 'System Updates'}
              </CardTitle>
              <CardDescription className="text-sm font-semibold mt-1">
                {language === 'mk' 
                  ? 'Проверете дали има нова верзија на софтверот' 
                  : 'Check for new software versions'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            onClick={() => {
              if (window.electron?.checkForUpdates) {
                toast.loading(language === 'mk' ? 'Се проверува за ажурирања...' : 'Checking for updates...', { id: 'update-check', duration: 4000 });
                window.electron.checkForUpdates();
              } else {
                toast.error(language === 'mk' ? 'Ажурирањата се достапни само во десктоп апликацијата.' : 'Updates are only available in the desktop app.');
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-12 px-6 font-bold text-xs shadow-md flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {language === 'mk' ? 'Провери за Ажурирања' : 'Check for Updates'}
          </Button>
        </CardContent>
      </Card>

      <form onSubmit={handleUpdate} className="space-y-6 mt-6">
        {/* Business Profile */}
        <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white transition-all">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50/80 rounded-2xl">
                <Building2 className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">{t('settings.businessProfile')}</CardTitle>
                <CardDescription className="text-sm font-semibold mt-1">
                  {language === 'mk' ? 'Основни податоци за деловниот објект' : 'Basic information about your establishment'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('settings.businessName')}</Label>
                <Input 
                  value={business.name} 
                  onChange={(e) => setBusiness({...business, name: e.target.value})}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('settings.currency')}</Label>
                <Input value={business.currency} disabled className="bg-zinc-50" />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.defaultTax')}</Label>
                <Input value={business.taxRate} disabled className="bg-zinc-50" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operational Settings */}
        <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white transition-all">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50/80 rounded-2xl">
                <SettingsIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">{t('settings.operational')}</CardTitle>
                <CardDescription className="text-sm font-semibold mt-1">
                  {language === 'mk' ? 'Вклучете или исклучете функционалности' : 'Toggle features on or off'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings.customerCredit')}</Label>
                <p className="text-xs text-zinc-500">{t('settings.customerCreditDesc')}</p>
              </div>
              <Switch 
                checked={business.settings?.allowCustomerCredit} 
                onCheckedChange={(checked) => setBusiness({
                  ...business, 
                  settings: { ...business.settings, allowCustomerCredit: checked }
                })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings.barcodeScanner')}</Label>
                <p className="text-xs text-zinc-500">{t('settings.barcodeScannerDesc')}</p>
              </div>
              <Switch 
                checked={business.settings?.useBarcodes} 
                onCheckedChange={(checked) => setBusiness({
                  ...business, 
                  settings: { ...business.settings, useBarcodes: checked }
                })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Fiscal Printer Config (Duna Maestral) */}
        <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white transition-all overflow-hidden">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-2xl">
                  <Printer className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">{t('settings.fiscalDevice')}</CardTitle>
                  <CardDescription className="text-sm font-semibold mt-0.5">{t('settings.fiscalModeDesc')}</CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={checkPrinter} 
                  disabled={isCheckingPrinter}
                  className="rounded-xl h-9 text-xs font-bold gap-1.5 border-zinc-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isCheckingPrinter ? 'animate-spin' : ''}`} />
                  {t('common.refresh')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status Box */}
              <div className="p-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/60 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{t('settings.deviceStatus')}</p>
                  <div className="flex items-center gap-2.5">
                    {printerStatus?.connected ? (
                      <div className="flex items-center gap-2 text-emerald-600 font-bold text-base">
                        <CheckCircle2 className="h-5 w-5" />
                        <span>{t('settings.online')}</span>
                      </div>
                    ) : printerStatus?.simulator ? (
                      <div className="flex items-center gap-2 text-amber-600 font-bold text-base">
                        <AlertCircle className="h-5 w-5" />
                        <span>{t('settings.simulator')}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-500 font-bold text-base">
                        <AlertCircle className="h-5 w-5" />
                        <span>{t('settings.offline')}</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-zinc-400 mt-3">
                  {language === 'mk' ? 'Тековна COM порта:' : 'Current COM Port:'} <strong className="text-zinc-700">{printerStatus?.port || 'None'}</strong>
                </p>
              </div>

              {/* Port Selector */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">{t('settings.selectComPort')}</Label>
                <div className="flex gap-2">
                  <select 
                    className="w-full h-12 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={printerStatus?.port || ''}
                    onChange={(e) => handleSelectPort(e.target.value)}
                  >
                    <option value="">{language === 'mk' ? '-- Изберете COM Порта --' : '-- Select COM Port --'}</option>
                    {printerStatus?.availablePorts && printerStatus.availablePorts.length > 0 ? (
                      printerStatus.availablePorts.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))
                    ) : (
                      <option value="COM1">COM1 (Default)</option>
                    )}
                  </select>
                </div>
                <p className="text-[11px] text-zinc-400">
                  {language === 'mk' ? 'Проверете дали касата е во режим' : 'Ensure the cash register is set to'} <strong>9999 + TOT &gt; 6. ПЦ</strong>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="border-t border-zinc-100 pt-5">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                {language === 'mk' ? 'Фискални Дејства и Тестови' : 'Fiscal Actions & Tests'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleTestPrint} 
                  disabled={isTestingSlip}
                  className="rounded-2xl h-11 px-5 border-zinc-200 text-zinc-800 font-bold text-xs hover:bg-zinc-100 transition-all shadow-sm"
                >
                  <Printer className="mr-2 h-4 w-4 text-indigo-600" />
                  {isTestingSlip ? (language === 'mk' ? 'Печатење...' : 'Printing...') : t('settings.printTestSlip')}
                </Button>

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleDailyReport('X')} 
                  disabled={isPrintingReport}
                  className="rounded-2xl h-11 px-5 border-zinc-200 text-zinc-800 font-bold text-xs hover:bg-zinc-100 transition-all shadow-sm"
                >
                  <FileText className="mr-2 h-4 w-4 text-amber-600" />
                  {t('settings.xReport')}
                </Button>

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleDailyReport('Z')} 
                  disabled={isPrintingReport}
                  className="rounded-2xl h-11 px-5 border-red-200 bg-red-50/50 text-red-700 font-bold text-xs hover:bg-red-100 transition-all shadow-sm"
                >
                  <FileText className="mr-2 h-4 w-4 text-red-600" />
                  {t('settings.zReport')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4">
          <Button 
            type="submit" 
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-2xl px-8 h-12 font-bold transition-all active:scale-[0.98]"
            disabled={isSaving}
          >
            {isSaving ? t('common.saving') : (
              <>
                <Save className="mr-2 h-5 w-5" /> {t('settings.saveSettings')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
