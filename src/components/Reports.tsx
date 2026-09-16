import React, { useMemo, useState } from 'react';
import { db, useLiveQuery } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { CashShift, Transaction } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Download, FileText, Calendar as CalendarIcon, Printer, ChevronRight, TrendingUp, CreditCard, Banknote, History, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { formatMKD, roundDenars } from '../lib/money';

const getRangeStart = (dateRange: string) => {
  const now = new Date();
  const startDate = new Date();

  if (dateRange === 'today') {
    startDate.setHours(0, 0, 0, 0);
    return { startDate };
  }

  if (dateRange === 'yesterday') {
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  if (dateRange === 'this-week') {
    startDate.setDate(now.getDate() - now.getDay() + 1);
    startDate.setHours(0, 0, 0, 0);
    return { startDate };
  }

  startDate.setFullYear(now.getFullYear(), now.getMonth(), 1);
  startDate.setHours(0, 0, 0, 0);
  return { startDate };
};

const toDateLabel = (value: any) => {
  if (!value) return 'Pending timestamp';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Pending timestamp'
    : date.toLocaleString('mk-MK', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

export function Reports() {
  const { profile } = useAuth();
  const [dateRange, setDateRange] = useState('today');

  const transactions = (useLiveQuery<Transaction[]>(
    () => (profile?.businessId ? db.transactions.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Transaction[];
  const shifts = (useLiveQuery<CashShift[]>(
    () => (profile?.businessId ? db.shifts.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as CashShift[];

  const activeShift = shifts
    .filter((shift) => shift.status === 'open')
    .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())[0] || null;
  const recentShifts = [...shifts]
    .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())
    .slice(0, 5);

  const { startDate, endDate } = useMemo(() => getRangeStart(dateRange), [dateRange]);
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const createdAt = new Date(transaction.createdAt);
        if (Number.isNaN(createdAt.getTime())) return false;
        if (createdAt < startDate) return false;
        if (endDate && createdAt > endDate) return false;
        return true;
      }),
    [transactions, startDate, endDate]
  );

  const salesTransactions = filteredTransactions.filter((transaction) => (transaction.type || 'sale') === 'sale');
  const totalSales = roundDenars(salesTransactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0));
  const cashSales = roundDenars(salesTransactions.filter((transaction) => transaction.paymentMethod === 'cash').reduce((sum, transaction) => sum + (transaction.amount || 0), 0));
  const cardSales = roundDenars(salesTransactions.filter((transaction) => transaction.paymentMethod === 'card').reduce((sum, transaction) => sum + (transaction.amount || 0), 0));
  const debtSales = roundDenars(salesTransactions.filter((transaction) => transaction.paymentMethod === 'debt').reduce((sum, transaction) => sum + (transaction.amount || 0), 0));
  const totalTax = roundDenars(salesTransactions.reduce((sum, transaction) => sum + (transaction.taxAmount || 0), 0));
  const expectedCashInDrawer = roundDenars((activeShift?.openingCash || 0) + salesTransactions
    .filter((transaction) => transaction.paymentMethod === 'cash' && transaction.shiftId === activeShift?.id)
    .reduce((sum, transaction) => sum + (transaction.amount || 0), 0));

  const handleOpenShift = async () => {
    if (!profile?.businessId) return;
    if (activeShift) {
      toast.error('A cash shift is already open');
      return;
    }

    const response = window.prompt('Opening cash amount');
    if (response === null) return;

    const openingCash = roundDenars(Number(response));
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      toast.error('Enter a valid opening cash amount');
      return;
    }

    try {
      await db.shifts.add({
        id: `shift-${Date.now()}`,
        businessId: profile.businessId,
        openedBy: profile.uid,
        openedByName: profile.name,
        openedAt: new Date().toISOString(),
        openingCash,
        status: 'open',
      });
      toast.success('Cash shift opened');
    } catch (error) {
      console.error(error);
      toast.error('Failed to open shift');
    }
  };

  const handleCloseShift = async () => {
    if (!profile?.businessId || !activeShift) {
      toast.error('No active shift to close');
      return;
    }

    const response = window.prompt('Declared cash at close', String(expectedCashInDrawer));
    if (response === null) return;

    const declaredCash = roundDenars(Number(response));
    if (!Number.isFinite(declaredCash) || declaredCash < 0) {
      toast.error('Enter a valid declared cash amount');
      return;
    }

    const variance = roundDenars(declaredCash - expectedCashInDrawer);

    try {
      await db.shifts.update(activeShift.id, {
        status: 'closed',
        expectedCash: expectedCashInDrawer,
        declaredCash,
        closingCash: declaredCash,
        variance,
        closedAt: new Date().toISOString(),
        closedBy: profile.uid,
      });
      toast.success('Shift closed', {
        description: `Expected ${formatMKD(expectedCashInDrawer)}, declared ${formatMKD(declaredCash)}`,
      });
    } catch (error) {
      console.error(error);
      toast.error('Failed to close shift');
    }
  };

  const handlePrintReport = (type: 'X' | 'Z') => {
    toast.success(`${type}-Report generated`, {
      description:
        type === 'Z'
          ? `Sales ${formatMKD(totalSales)}. Drawer ${formatMKD(expectedCashInDrawer)}.`
          : `Current shift status with ${salesTransactions.length} sales transactions.`,
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Financial Reports</h2>
          <p className="text-zinc-500">Sales, drawer totals, and shift variance</p>
        </div>
        <div className="flex gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px] rounded-xl border-zinc-200 bg-white">
              <CalendarIcon className="mr-2 h-4 w-4 text-zinc-400" />
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-zinc-900 rounded-xl">
            <Download className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card className="border-zinc-200 shadow-sm rounded-3xl bg-zinc-900 text-white">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-sm font-medium">Gross Sales</p>
            <h3 className="text-3xl font-bold mt-2">{formatMKD(totalSales)}</h3>
            <div className="mt-4 flex items-center gap-2 text-zinc-400 text-xs">
              <TrendingUp className="h-3 w-3" />
              <span>{salesTransactions.length} sales transactions</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardContent className="p-6">
            <p className="text-zinc-500 text-sm font-medium">Payment Methods</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-green-600" />
                  <span>Cash</span>
                </div>
                <span className="font-bold">{formatMKD(cashSales)}</span>
              </div>
              <div className="flex items-center justify-between gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  <span>Card</span>
                </div>
                <span className="font-bold">{formatMKD(cardSales)}</span>
              </div>
              <div className="flex items-center justify-between gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-amber-600" />
                  <span>Debt</span>
                </div>
                <span className="font-bold">{formatMKD(debtSales)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardContent className="p-6">
            <p className="text-zinc-500 text-sm font-medium">Tax Collected</p>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span>Total DDV</span>
                <span className="font-bold">{formatMKD(totalTax)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Net Sales</span>
                <span className="font-bold">{formatMKD(totalSales - totalTax)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardContent className="p-6">
            <p className="text-zinc-500 text-sm font-medium">Active Drawer</p>
            <h3 className="text-3xl font-bold mt-2">{formatMKD(expectedCashInDrawer)}</h3>
            <div className="mt-4 flex items-center gap-2 text-xs">
              <Badge
                variant="outline"
                className={activeShift ? 'bg-green-50 text-green-700 border-green-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}
              >
                {activeShift ? 'Shift Open' : 'Shift Closed'}
              </Badge>
              <span className="text-zinc-500">Opening cash included</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="p-6 border-b border-zinc-100">
            <CardTitle className="text-lg font-bold">Cash Shift Control</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Shift status</span>
                <span className="font-semibold">{activeShift ? 'Open' : 'Closed'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Opening cash</span>
                <span className="font-semibold">{formatMKD(activeShift?.openingCash || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Expected drawer</span>
                <span className="font-semibold">{formatMKD(expectedCashInDrawer)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button className="rounded-2xl h-12 bg-zinc-900" onClick={handleOpenShift} disabled={!!activeShift}>
                <Wallet className="mr-2 h-4 w-4" />
                Open Shift
              </Button>
              <Button variant="outline" className="rounded-2xl h-12" onClick={handleCloseShift} disabled={!activeShift}>
                <Printer className="mr-2 h-4 w-4" />
                Close Shift
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="p-6 border-b border-zinc-100">
            <CardTitle className="text-lg font-bold">Recent Shifts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  <TableHead className="pl-6">Opened</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="pr-6 text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentShifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="pl-6 text-sm">{toDateLabel(shift.openedAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={shift.status === 'open' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-zinc-100 text-zinc-700 border-zinc-200'}
                      >
                        {shift.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatMKD(shift.expectedCash || shift.openingCash || 0)}</TableCell>
                    <TableCell className="pr-6 text-right font-semibold">
                      {formatMKD(shift.variance || 0)}
                    </TableCell>
                  </TableRow>
                ))}
                {recentShifts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-zinc-400">
                      No shifts recorded yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
        <CardHeader className="p-6 border-b border-zinc-100">
          <CardTitle className="text-lg font-bold">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-50/50">
              <TableRow>
                <TableHead className="pl-6">Transaction ID</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right pr-6">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id} className="hover:bg-zinc-50/50 transition-colors">
                  <TableCell className="pl-6 font-mono text-xs text-zinc-500">
                    #{transaction.id.slice(-8).toUpperCase()}
                  </TableCell>
                  <TableCell className="text-sm">{toDateLabel(transaction.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full capitalize">
                      {transaction.type || 'sale'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full capitalize flex items-center w-fit gap-1">
                      {transaction.paymentMethod === 'cash' ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                      {transaction.paymentMethod}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">{formatMKD(transaction.taxAmount || 0)}</TableCell>
                  <TableCell className="text-right pr-6 font-bold">{formatMKD(transaction.amount || 0)}</TableCell>
                </TableRow>
              ))}
              {filteredTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-zinc-400">
                    No transactions found for this period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          className="border-zinc-200 shadow-sm rounded-3xl p-6 flex items-center justify-between hover:border-zinc-900 transition-colors cursor-pointer group"
          onClick={() => handlePrintReport('Z')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-100 rounded-2xl group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <Printer className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-bold">Daily Z-Report</h4>
              <p className="text-sm text-zinc-500">Close shift totals and variance summary</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-zinc-900" />
        </Card>

        <Card
          className="border-zinc-200 shadow-sm rounded-3xl p-6 flex items-center justify-between hover:border-zinc-900 transition-colors cursor-pointer group"
          onClick={() => handlePrintReport('X')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-100 rounded-2xl group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-bold">X-Report</h4>
              <p className="text-sm text-zinc-500">Current shift status without closing</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-zinc-900" />
        </Card>
      </div>
    </div>
  );
}
