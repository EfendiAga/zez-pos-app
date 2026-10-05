import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Banknote, CheckCircle2, ClipboardList, Lock, Printer, Unlock, Wallet, X, Plus, Minus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { db, useLiveQuery } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { Shift, Transaction } from '../types';
import { formatMKD, roundDenars } from '../lib/money';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useI18n } from '../lib/i18n';
import { fiscalService } from '../services/fiscalService';

const formatDateTime = (value?: string, locale: string = 'mk-MK') => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (start?: string, end?: string, hLabel = 'h', mLabel = 'm') => {
  if (!start) return `0${mLabel}`;
  const from = new Date(start);
  const to = end ? new Date(end) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `0${mLabel}`;
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours}${hLabel} ${remaining}${mLabel}` : `${remaining}${mLabel}`;
};

export function ShiftManager() {
  const { profile } = useAuth();
  const { t, language } = useI18n();
  const dateLocale = language === 'mk' ? 'mk-MK' : 'en-US';
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Cash In / Cash Out (Службен влез / излез) state
  const [isCashOpOpen, setIsCashOpOpen] = useState(false);
  const [cashOpType, setCashOpType] = useState<'in' | 'out'>('in');
  const [cashOpAmount, setCashOpAmount] = useState('');
  const [cashOpNote, setCashOpNote] = useState('');

  const shifts = (useLiveQuery<Shift[]>(
    () => (profile?.businessId ? db.shifts.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Shift[];
  const transactions = (useLiveQuery<Transaction[]>(
    () => (profile?.businessId ? db.transactions.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Transaction[];

  const currentShift = useMemo(
    () =>
      [...shifts]
        .filter((shift) => shift.status === 'open')
        .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())[0],
    [shifts]
  );

  // Auto-cleanup any zombie shifts that got stuck open from older bugs
  useEffect(() => {
    const cleanupZombieShifts = async () => {
      const openShifts = shifts.filter((s) => s.status === 'open').sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime());
      if (openShifts.length > 1) {
        const zombies = openShifts.slice(1);
        for (const zombie of zombies) {
          await db.shifts.update(zombie.id, { status: 'closed', closedAt: new Date().toISOString(), notes: 'Auto-closed zombie shift' });
        }
      }
    };
    cleanupZombieShifts();
  }, [shifts]);

  const recentShifts = useMemo(
    () =>
      [...shifts]
        .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())
        .slice(0, 7),
    [shifts]
  );

  const currentShiftTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.shiftId === currentShift?.id),
    [transactions, currentShift?.id]
  );

  const currentCashSales = roundDenars(
    currentShiftTransactions
      .filter((transaction) => transaction.paymentMethod === 'cash' && transaction.type !== 'debt_payment')
      .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  );
  const currentCardSales = roundDenars(
    currentShiftTransactions
      .filter((transaction) => transaction.paymentMethod === 'card' && transaction.type !== 'debt_payment')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0)
  );
  const currentDebtPayments = roundDenars(
    currentShiftTransactions
      .filter((transaction) => transaction.type === 'debt_payment')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0)
  );
  const currentCashIn = roundDenars(
    currentShiftTransactions
      .filter((t) => t.type === 'cash_in')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  );
  const currentCashOut = roundDenars(
    currentShiftTransactions
      .filter((t) => t.type === 'cash_out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  );
  const safeOpeningCash = roundDenars(currentShift?.openingCash || 0);
  const expectedCash = roundDenars(safeOpeningCash + currentCashSales + currentDebtPayments + currentCashIn - currentCashOut);
  const liveVariance = closingCash ? roundDenars(Number(closingCash) - expectedCash) : null;

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId) return;
    if (currentShift) {
      toast.error(language === 'mk' ? 'Веќе има активна отворена смена' : 'A shift is already open');
      return;
    }

    const parsedOpeningCash = roundDenars(Number(openingCash));
    if (!Number.isFinite(parsedOpeningCash) || parsedOpeningCash < 0) {
      toast.error(language === 'mk' ? 'Внесете валиден почетен депозит' : 'Enter a valid opening cash amount');
      return;
    }

    setLoading(true);
    try {
      await db.shifts.add({
        id: `shift-${Date.now()}`,
        businessId: profile.businessId,
        openedBy: profile.uid,
        openedByName: profile.name,
        openedAt: new Date().toISOString(),
        openingCash: parsedOpeningCash,
        status: 'open',
      });
      toast.success(language === 'mk' ? 'Смената е успешно отворена' : 'Shift opened');
      setOpeningCash('');
      setIsOpeningShift(false);
    } catch (error) {
      console.error('Failed to open shift:', error);
      toast.error(language === 'mk' ? 'Грешка при отворање смена' : 'Failed to open shift');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !currentShift) return;

    const declaredCash = roundDenars(Number(closingCash));
    if (!Number.isFinite(declaredCash) || declaredCash < 0) {
      toast.error(language === 'mk' ? 'Внесете валиден износ на готовина' : 'Enter a valid closing cash amount');
      return;
    }

    const variance = roundDenars(declaredCash - expectedCash);
    const totalRevenue = roundDenars(currentCashSales + currentCardSales + currentDebtPayments);

    setLoading(true);
    try {
      await db.shifts.update(currentShift.id, {
        status: 'closed',
        expectedCash,
        declaredCash,
        closingCash: declaredCash,
        variance,
        totalCashSales: currentCashSales,
        totalCardSales: currentCardSales,
        totalCashIn: currentCashIn,
        totalCashOut: currentCashOut,
        totalOrders: currentShiftTransactions.filter((transaction) => transaction.type !== 'debt_payment' && !transaction.isRefund && transaction.type !== 'cash_in' && transaction.type !== 'cash_out').length,
        totalRevenue,
        notes: closeNotes.trim() || '',
        closedAt: new Date().toISOString(),
        closedBy: profile.uid,
      });
      toast.success(language === 'mk' ? 'Смената е затворена' : 'Shift closed', {
        description: `${language === 'mk' ? 'Очекувано' : 'Expected'} ${formatMKD(expectedCash)}, ${language === 'mk' ? 'изброено' : 'declared'} ${formatMKD(declaredCash)}`,
      });

      // Optionally offer fiscal Z-report
      if (window.confirm(t('shift.zReportPrompt'))) {
        try {
          await fiscalService.printDailyReport('Z');
          toast.success(language === 'mk' ? 'ДФИ / Нулирање е испечатено на касата' : 'Fiscal Z-Report printed');
        } catch (err) {
          console.warn('Fiscal Z-report skipped/failed:', err);
        }
      }

      setClosingCash('');
      setCloseNotes('');
      setIsClosingShift(false);
    } catch (error) {
      console.error('Failed to close shift:', error);
      toast.error(language === 'mk' ? 'Грешка при затворање смена' : 'Failed to close shift');
    } finally {
      setLoading(false);
    }
  };

  const handleCashOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !currentShift) return;

    const parsedAmount = roundDenars(Number(cashOpAmount));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error(language === 'mk' ? 'Внесете валиден износ' : 'Enter a valid amount');
      return;
    }

    if (cashOpType === 'out' && parsedAmount > expectedCash) {
      if (!window.confirm(
        language === 'mk'
          ? `Внимание: Износот за излез (${formatMKD(parsedAmount)}) е поголем од очекуваната готовина во касата (${formatMKD(expectedCash)}). Дали сакате да продолжите?`
          : `Warning: Payout amount (${formatMKD(parsedAmount)}) exceeds expected cash in drawer (${formatMKD(expectedCash)}). Continue?`
      )) {
        return;
      }
    }

    setLoading(true);
    try {
      const defaultNote = cashOpType === 'in'
        ? (language === 'mk' ? 'Службен влез (депозит)' : 'Cash in deposit')
        : (language === 'mk' ? 'Службен излез (исплата)' : 'Cash payout');

      await db.transactions.add({
        id: `cash-op-${Date.now()}`,
        amount: parsedAmount,
        paymentMethod: 'cash',
        businessId: profile.businessId,
        createdBy: profile.uid,
        createdByName: profile.name,
        shiftId: currentShift.id,
        type: cashOpType === 'in' ? 'cash_in' : 'cash_out',
        notes: cashOpNote.trim() || defaultNote,
        createdAt: new Date().toISOString(),
      });

      // Send to Duna Maestral fiscal printer
      try {
        const fiscalRes = await fiscalService.printCashOperation(cashOpType, parsedAmount);
        if (fiscalRes.success) {
          toast.success(fiscalRes.message);
        }
      } catch (fErr) {
        console.warn('Fiscal cash operation print skipped:', fErr);
      }

      toast.success(
        cashOpType === 'in'
          ? (language === 'mk' ? `Евидентиран службен влез: +${formatMKD(parsedAmount)}` : `Cash in recorded: +${formatMKD(parsedAmount)}`)
          : (language === 'mk' ? `Евидентиран службен излез: -${formatMKD(parsedAmount)}` : `Cash out recorded: -${formatMKD(parsedAmount)}`)
      );

      setIsCashOpOpen(false);
      setCashOpAmount('');
      setCashOpNote('');
    } catch (error) {
      console.error('Failed to record cash operation:', error);
      toast.error(language === 'mk' ? 'Грешка при евидентирање на готовината' : 'Failed to record cash operation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-zinc-900 tracking-tight">{t('shift.title')}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{t('shift.subtitle')}</p>
      </div>

      <div
        className={cn(
          'rounded-3xl p-6 border-2',
          currentShift ? 'bg-emerald-50 border-emerald-200' : 'bg-zinc-50 border-zinc-200'
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'h-14 w-14 rounded-2xl flex items-center justify-center shrink-0',
                currentShift ? 'bg-emerald-500' : 'bg-zinc-300'
              )}
            >
              {currentShift ? <Unlock className="h-7 w-7 text-white" /> : <Lock className="h-7 w-7 text-white" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-zinc-900">
                  {currentShift ? t('shift.active') : t('shift.noActive')}
                </h3>
                {currentShift && <Badge className="bg-emerald-500 text-white rounded-full">LIVE</Badge>}
              </div>
              {currentShift ? (
                <>
                  <p className="text-sm text-zinc-600">
                    {t('shift.openedBy')} <strong>{currentShift.openedByName}</strong> {language === 'mk' ? 'во' : 'at'} <strong>{formatDateTime(currentShift.openedAt, dateLocale)}</strong>
                  </p>
                  <p className="text-sm text-zinc-600">
                    {t('shift.duration')} <strong>{formatDuration(currentShift.openedAt, undefined, language === 'mk' ? 'ч' : 'h', language === 'mk' ? 'м' : 'm')}</strong> • {t('shift.cashFloat')} <strong>{formatMKD(safeOpeningCash)}</strong>
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">{t('shift.openWarning')}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-full lg:min-w-[440px]">
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">{t('shift.cashSales')}</p>
              <p className="mt-1 text-lg font-black text-zinc-900">{formatMKD(currentCashSales)}</p>
              {(currentCashIn > 0 || currentCashOut > 0) && (
                <div className="mt-1 flex items-center gap-2 text-[11px] font-bold">
                  {currentCashIn > 0 && <span className="text-emerald-600">+{formatMKD(currentCashIn)}</span>}
                  {currentCashOut > 0 && <span className="text-amber-600">-{formatMKD(currentCashOut)}</span>}
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">{t('shift.cardSales')}</p>
              <p className="mt-1 text-lg font-black text-zinc-900">{formatMKD(currentCardSales)}</p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">{t('shift.expectedCash')}</p>
              <p className="mt-1 text-lg font-black text-zinc-900">{formatMKD(expectedCash)}</p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">{t('shift.orders')}</p>
              <p className="mt-1 text-lg font-black text-zinc-900">
                {currentShiftTransactions.filter((transaction) => transaction.type !== 'debt_payment' && !transaction.isRefund && transaction.type !== 'cash_in' && transaction.type !== 'cash_out').length}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {currentShift && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-2xl h-11 border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold text-xs shadow-xs"
                onClick={() => {
                  setCashOpType('in');
                  setCashOpAmount('');
                  setCashOpNote('');
                  setIsCashOpOpen(true);
                }}
              >
                <ArrowDownLeft className="mr-1.5 h-4 w-4 text-emerald-600" />
                {t('shift.cashIn')}
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl h-11 border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 font-bold text-xs shadow-xs"
                onClick={() => {
                  setCashOpType('out');
                  setCashOpAmount('');
                  setCashOpNote('');
                  setIsCashOpOpen(true);
                }}
              >
                <ArrowUpRight className="mr-1.5 h-4 w-4 text-amber-600" />
                {t('shift.cashOut')}
              </Button>
            </div>
          )}

          <div className="flex justify-end ml-auto">
            {!currentShift ? (
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl h-12 px-6 font-bold" onClick={() => setIsOpeningShift(true)}>
                <Unlock className="mr-2 h-4 w-4" />
                {t('shift.openBtn')}
              </Button>
            ) : (
              <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 rounded-2xl h-12 px-6 font-bold" onClick={() => setIsClosingShift(true)}>
                <Lock className="mr-2 h-4 w-4" />
                {t('shift.closeBtn')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">{t('shift.recent')}</h3>
        <div className="space-y-3">
          {recentShifts.length === 0 && (
            <div className="text-center py-12 text-zinc-400 bg-white rounded-3xl border border-zinc-100">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">{t('shift.noHistory')}</p>
            </div>
          )}

          {recentShifts.map((shift) => (
            <div key={shift.id} className="bg-white border border-zinc-100 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div>
                  <p className="font-bold text-zinc-900">{shift.openedByName || (language === 'mk' ? 'Непознат корисник' : 'Unknown user')}</p>
                  <p className="text-xs text-zinc-400">
                    {formatDateTime(shift.openedAt, dateLocale)}
                    {shift.closedAt ? ` → ${formatDateTime(shift.closedAt, dateLocale)}` : ''} • {formatDuration(shift.openedAt, shift.closedAt, language === 'mk' ? 'ч' : 'h', language === 'mk' ? 'м' : 'm')}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full capitalize font-bold w-fit',
                    shift.status === 'open' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'text-zinc-500'
                  )}
                >
                  {shift.status === 'open' ? (language === 'mk' ? 'Отворена' : 'Open') : (language === 'mk' ? 'Затворена' : 'Closed')}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">{language === 'mk' ? 'Почеток' : 'Opened'}</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.openingCash || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">{language === 'mk' ? 'Крај' : 'Closed'}</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.declaredCash || shift.closingCash || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">{language === 'mk' ? 'Очекувано' : 'Expected'}</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.expectedCash || shift.openingCash || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('shift.cashSales')}</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.totalCashSales || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('shift.cardSales')}</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.totalCardSales || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('shift.orders')}</p>
                  <p className="font-bold text-zinc-900">{shift.totalOrders || 0}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">{t('shift.revenue')}</p>
                  <p className="font-bold text-emerald-700">{formatMKD(shift.totalRevenue || 0)}</p>
                </div>
              </div>

              {typeof shift.variance === 'number' && (
                <div className="mt-3 text-sm">
                  <span className="text-zinc-500">{t('shift.difference')}: </span>
                  <span
                    className={cn(
                      'font-bold',
                      shift.variance === 0 ? 'text-zinc-900' : shift.variance > 0 ? 'text-blue-700' : 'text-red-700'
                    )}
                  >
                    {formatMKD(shift.variance)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isOpeningShift && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpeningShift(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h2 className="text-xl font-black text-zinc-900">{t('shift.openingModalTitle')}</h2>
                <button onClick={() => setIsOpeningShift(false)} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>
              <form onSubmit={handleOpenShift} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{t('shift.cashFloat')}</Label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="e.g. 5000" className="pl-9 rounded-xl border-zinc-200 h-12 text-base" min="0" step="1" autoFocus />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold" disabled={loading}>
                  <Unlock className="mr-2 h-4 w-4" />
                  {loading ? t('shift.openingWait') : t('shift.openBtn')}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isClosingShift && currentShift && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsClosingShift(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h2 className="text-xl font-black text-zinc-900">{t('shift.closingModalTitle')}</h2>
                <button onClick={() => setIsClosingShift(false)} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>
              <form onSubmit={handleCloseShift} className="p-6 space-y-5">
                <div className="bg-zinc-50 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">{t('shift.cashFloat')}</span>
                    <span className="font-bold">{formatMKD(safeOpeningCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">{t('shift.cashSales')}</span>
                    <span className="font-bold">{formatMKD(currentCashSales)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">{t('shift.cardSales')}</span>
                    <span className="font-bold">{formatMKD(currentCardSales)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">{t('shift.expectedCash')}</span>
                    <span className="font-bold">{formatMKD(expectedCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">{t('shift.orders')}</span>
                    <span className="font-bold">{currentShiftTransactions.filter((transaction) => transaction.type !== 'debt_payment' && !transaction.isRefund).length}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{t('shift.actualCash')}</Label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input type="number" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder={t('shift.countDrawer')} className="pl-9 rounded-xl border-zinc-200 h-12" min="0" step="1" autoFocus />
                  </div>
                  {liveVariance !== null && (
                    <div className={cn('flex items-center gap-2 text-sm font-bold mt-2', liveVariance === 0 ? 'text-emerald-600' : liveVariance > 0 ? 'text-blue-600' : 'text-red-600')}>
                      {liveVariance === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {liveVariance === 0
                        ? t('shift.balanced')
                        : liveVariance > 0
                          ? `${t('shift.over')} ${formatMKD(liveVariance)}`
                          : `${t('shift.short')} ${formatMKD(Math.abs(liveVariance))}`}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{t('shift.notes')}</Label>
                  <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder={language === 'mk' ? 'Опционална забелешка' : 'Optional closing notes'} className="rounded-xl border-zinc-200 h-11" />
                </div>

                <Button type="submit" className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold" disabled={loading}>
                  <Printer className="mr-2 h-4 w-4" />
                  {loading ? t('shift.closingWait') : t('shift.closeAndSave')}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cash In / Cash Out Modal */}
      <AnimatePresence>
        {isCashOpOpen && currentShift && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsCashOpOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-10 w-10 rounded-2xl flex items-center justify-center font-black',
                      cashOpType === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    )}
                  >
                    {cashOpType === 'in' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 leading-none">
                      {cashOpType === 'in'
                        ? (language === 'mk' ? 'Службен Влез на Готовина' : 'Cash In (Deposit)')
                        : (language === 'mk' ? 'Службен Излез на Готовина' : 'Cash Out (Payout)')}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      {language === 'mk'
                        ? `Очекувана состојба во каса: ${formatMKD(expectedCash)}`
                        : `Current expected in drawer: ${formatMKD(expectedCash)}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCashOpOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Type toggle */}
              <div className="mt-4 grid grid-cols-2 p-1 bg-zinc-100 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setCashOpType('in')}
                  className={cn(
                    'py-2 rounded-lg transition-all',
                    cashOpType === 'in'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  )}
                >
                  {t('shift.cashIn')}
                </button>
                <button
                  type="button"
                  onClick={() => setCashOpType('out')}
                  className={cn(
                    'py-2 rounded-lg transition-all',
                    cashOpType === 'out'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  )}
                >
                  {t('shift.cashOut')}
                </button>
              </div>

              <form onSubmit={handleCashOperation} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">
                    {language === 'mk' ? 'Износ (МКД) *' : 'Amount (MKD) *'}
                  </Label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="number"
                      value={cashOpAmount}
                      onChange={(e) => setCashOpAmount(e.target.value)}
                      placeholder="e.g. 2000"
                      className="pl-9 rounded-xl border-zinc-200 h-12 text-lg font-mono font-bold"
                      min="1"
                      step="1"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">
                    {language === 'mk' ? 'Причина / Забелешка' : 'Reason / Note'}
                  </Label>
                  <Input
                    value={cashOpNote}
                    onChange={(e) => setCashOpNote(e.target.value)}
                    placeholder={
                      cashOpType === 'in'
                        ? (language === 'mk' ? 'пр. Ситни пари за враќање од сопственик' : 'e.g. Change replenishment')
                        : (language === 'mk' ? 'пр. Исплата на добавувач за пекара' : 'e.g. Supplier payment or bank drop')
                    }
                    className="rounded-xl border-zinc-200 h-11"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCashOpOpen(false)}
                    className="rounded-xl h-12 flex-1"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      'rounded-xl h-12 flex-1 font-bold text-white shadow-md',
                      cashOpType === 'in'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                    )}
                  >
                    {loading ? t('common.saving') : (language === 'mk' ? 'Потврди' : 'Confirm')}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
