import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Banknote, CheckCircle2, ClipboardList, Lock, Printer, Unlock, Wallet, X } from 'lucide-react';
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

const formatDateTime = (value?: string) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString('mk-MK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (start?: string, end?: string) => {
  if (!start) return '0m';
  const from = new Date(start);
  const to = end ? new Date(end) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '0m';
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours}h ${remaining}m` : `${remaining}m`;
};

export function ShiftManager() {
  const { profile } = useAuth();
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [loading, setLoading] = useState(false);

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

  const recentShifts = useMemo(
    () =>
      [...shifts]
        .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())
        .slice(0, 7),
    [shifts]
  );

  const currentShiftTransactions = useMemo(
    () => transactions.filter((transaction) => !transaction.isRefund && transaction.shiftId === currentShift?.id),
    [transactions, currentShift?.id]
  );

  const currentCashSales = roundDenars(
    currentShiftTransactions
      .filter((transaction) => transaction.paymentMethod === 'cash' && transaction.type !== 'debt_payment')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0)
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
  const safeOpeningCash = roundDenars(currentShift?.openingCash || 0);
  const expectedCash = roundDenars(safeOpeningCash + currentCashSales + currentDebtPayments);
  const liveVariance = closingCash ? roundDenars(Number(closingCash) - expectedCash) : null;

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId) return;
    if (currentShift) {
      toast.error('A shift is already open');
      return;
    }

    const parsedOpeningCash = roundDenars(Number(openingCash));
    if (!Number.isFinite(parsedOpeningCash) || parsedOpeningCash < 0) {
      toast.error('Enter a valid opening cash amount');
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
      toast.success('Shift opened');
      setOpeningCash('');
      setIsOpeningShift(false);
    } catch (error) {
      console.error('Failed to open shift:', error);
      toast.error('Failed to open shift');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !currentShift) return;

    const declaredCash = roundDenars(Number(closingCash));
    if (!Number.isFinite(declaredCash) || declaredCash < 0) {
      toast.error('Enter a valid closing cash amount');
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
        totalOrders: currentShiftTransactions.filter((transaction) => transaction.type !== 'debt_payment').length,
        totalRevenue,
        notes: closeNotes.trim() || '',
        closedAt: new Date().toISOString(),
        closedBy: profile.uid,
      });
      toast.success('Shift closed', {
        description: `Expected ${formatMKD(expectedCash)}, declared ${formatMKD(declaredCash)}`,
      });
      setClosingCash('');
      setCloseNotes('');
      setIsClosingShift(false);
    } catch (error) {
      console.error('Failed to close shift:', error);
      toast.error('Failed to close shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Shift Management</h2>
        <p className="text-sm text-zinc-500 mt-0.5">One active shift per business, with real cash and payment totals.</p>
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
                <h3 className="text-xl font-black text-zinc-900">{currentShift ? 'Shift Open' : 'No Active Shift'}</h3>
                {currentShift && <Badge className="bg-emerald-500 text-white rounded-full">Live</Badge>}
              </div>
              {currentShift ? (
                <>
                  <p className="text-sm text-zinc-600">
                    Opened by <strong>{currentShift.openedByName}</strong> at <strong>{formatDateTime(currentShift.openedAt)}</strong>
                  </p>
                  <p className="text-sm text-zinc-600">
                    Duration <strong>{formatDuration(currentShift.openedAt)}</strong> • Opening cash <strong>{formatMKD(safeOpeningCash)}</strong>
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Open a shift before processing cash or card sales.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-full lg:min-w-[440px]">
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">Cash Sales</p>
              <p className="mt-1 text-lg font-black text-zinc-900">{formatMKD(currentCashSales)}</p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">Card Sales</p>
              <p className="mt-1 text-lg font-black text-zinc-900">{formatMKD(currentCardSales)}</p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">Expected Cash</p>
              <p className="mt-1 text-lg font-black text-zinc-900">{formatMKD(expectedCash)}</p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">Orders</p>
              <p className="mt-1 text-lg font-black text-zinc-900">
                {currentShiftTransactions.filter((transaction) => transaction.type !== 'debt_payment').length}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          {!currentShift ? (
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl h-12 px-6 font-bold" onClick={() => setIsOpeningShift(true)}>
              <Unlock className="mr-2 h-4 w-4" />
              Open Shift
            </Button>
          ) : (
            <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 rounded-2xl h-12 px-6 font-bold" onClick={() => setIsClosingShift(true)}>
              <Lock className="mr-2 h-4 w-4" />
              Close Shift
            </Button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">Recent Shifts</h3>
        <div className="space-y-3">
          {recentShifts.length === 0 && (
            <div className="text-center py-12 text-zinc-400 bg-white rounded-3xl border border-zinc-100">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No shift history yet</p>
            </div>
          )}

          {recentShifts.map((shift) => (
            <div key={shift.id} className="bg-white border border-zinc-100 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div>
                  <p className="font-bold text-zinc-900">{shift.openedByName || 'Unknown user'}</p>
                  <p className="text-xs text-zinc-400">
                    {formatDateTime(shift.openedAt)}
                    {shift.closedAt ? ` → ${formatDateTime(shift.closedAt)}` : ''} • {formatDuration(shift.openedAt, shift.closedAt)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full capitalize font-bold w-fit',
                    shift.status === 'open' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'text-zinc-500'
                  )}
                >
                  {shift.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Opened</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.openingCash || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Closed</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.declaredCash || shift.closingCash || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Expected</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.expectedCash || shift.openingCash || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Cash Sales</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.totalCashSales || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Card Sales</p>
                  <p className="font-bold text-zinc-900">{formatMKD(shift.totalCardSales || 0)}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Orders</p>
                  <p className="font-bold text-zinc-900">{shift.totalOrders || 0}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Revenue</p>
                  <p className="font-bold text-emerald-700">{formatMKD(shift.totalRevenue || 0)}</p>
                </div>
              </div>

              {typeof shift.variance === 'number' && (
                <div className="mt-3 text-sm">
                  <span className="text-zinc-500">Variance: </span>
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
                <h2 className="text-xl font-black text-zinc-900">Open Shift</h2>
                <button onClick={() => setIsOpeningShift(false)} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>
              <form onSubmit={handleOpenShift} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Opening Cash in Drawer</Label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="e.g. 5000" className="pl-9 rounded-xl border-zinc-200 h-12 text-base" min="0" step="1" autoFocus />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold" disabled={loading}>
                  <Unlock className="mr-2 h-4 w-4" />
                  {loading ? 'Opening...' : 'Open Shift'}
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
                <h2 className="text-xl font-black text-zinc-900">Close Shift</h2>
                <button onClick={() => setIsClosingShift(false)} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>
              <form onSubmit={handleCloseShift} className="p-6 space-y-5">
                <div className="bg-zinc-50 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Opening Cash</span>
                    <span className="font-bold">{formatMKD(safeOpeningCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Cash Sales</span>
                    <span className="font-bold">{formatMKD(currentCashSales)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Card Sales</span>
                    <span className="font-bold">{formatMKD(currentCardSales)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Expected Cash</span>
                    <span className="font-bold">{formatMKD(expectedCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Total Orders</span>
                    <span className="font-bold">{currentShiftTransactions.filter((transaction) => transaction.type !== 'debt_payment').length}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Declared Cash at Close</Label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input type="number" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="Count drawer cash" className="pl-9 rounded-xl border-zinc-200 h-12" min="0" step="1" autoFocus />
                  </div>
                  {liveVariance !== null && (
                    <div className={cn('flex items-center gap-2 text-sm font-bold mt-2', liveVariance === 0 ? 'text-emerald-600' : liveVariance > 0 ? 'text-blue-600' : 'text-red-600')}>
                      {liveVariance === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {liveVariance === 0
                        ? 'Cash balanced perfectly'
                        : liveVariance > 0
                          ? `Over by ${formatMKD(liveVariance)}`
                          : `Short by ${formatMKD(Math.abs(liveVariance))}`}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Notes</Label>
                  <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Optional closing notes" className="rounded-xl border-zinc-200 h-11" />
                </div>

                <Button type="submit" className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold" disabled={loading}>
                  <Printer className="mr-2 h-4 w-4" />
                  {loading ? 'Closing...' : 'Close Shift & Save Z Summary'}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
