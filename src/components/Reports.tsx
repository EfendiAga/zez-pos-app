import React, { useMemo, useState } from 'react';
import { db, useLiveQuery } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { CashShift, Transaction } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Download, FileText, Calendar as CalendarIcon, Printer, ChevronRight, TrendingUp, CreditCard, Banknote, History, Wallet, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMKD, roundDenars } from '../lib/money';
import { useI18n } from '../lib/i18n';
import { fiscalService } from '../services/fiscalService';

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

const toDateLabel = (value: any, locale: string = 'mk-MK') => {
  if (!value) return 'Pending timestamp';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Pending timestamp'
    : date.toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

export function Reports() {
  const { profile } = useAuth();
  const { t, language } = useI18n();
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

  const [isPrintingFiscal, setIsPrintingFiscal] = useState(false);

  const handlePrintReport = async (type: 'X' | 'Z') => {
    const reportName = type === 'Z' ? t('settings.zReport') : t('settings.xReport');
    if (type === 'Z' && !window.confirm(
      language === 'mk'
        ? `Дали сте сигурни дека сакате да печатите ${reportName}? Ова го нулира дневниот промет на фискалниот уред Duna Maestral.`
        : `Are you sure you want to print ${reportName}? This will reset daily totals in the Duna Maestral fiscal memory.`
    )) {
      return;
    }

    setIsPrintingFiscal(true);
    toast.loading(language === 'mk' ? `Печатење ${reportName}...` : `Printing ${reportName}...`, { id: 'rep-print' });
    try {
      const res = await fiscalService.printDailyReport(type);
      if (res.success) {
        toast.success(
          language === 'mk'
            ? `${reportName} е успешно испечатен на фискалната каса!`
            : `${reportName} printed successfully on Duna Maestral!`,
          { id: 'rep-print' }
        );
      } else {
        toast.error(res.message || (language === 'mk' ? `Неуспешно печатење на ${reportName}` : `Failed to print ${reportName}`), { id: 'rep-print' });
      }
    } catch {
      toast.error(language === 'mk' ? 'Нема врска со фискалниот сервис на порт 8181' : 'Cannot connect to fiscal bridge on port 8181', { id: 'rep-print' });
    } finally {
      setIsPrintingFiscal(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error(language === 'mk' ? 'Нема трансакции за експорт' : 'No transactions to export');
      return;
    }

    const headers = language === 'mk'
      ? ['Број на Сметка', 'Датум и Време', 'Тип', 'Начин на Плаќање', 'Нето Износ (ден)', 'ДДВ (ден)', 'Вкупно (ден)', 'Забелешка']
      : ['Transaction ID', 'Date & Time', 'Type', 'Payment Method', 'Net Amount (MKD)', 'VAT (MKD)', 'Total (MKD)', 'Notes'];

    const rows = filteredTransactions.map((t) => {
      const net = (t.netAmount || (t.amount - (t.taxAmount || 0))).toFixed(2);
      const vat = (t.taxAmount || 0).toFixed(2);
      const tot = (t.amount || 0).toFixed(2);
      const dt = toDateLabel(t.createdAt, language === 'mk' ? 'mk-MK' : 'en-US');
      const type = t.type === 'debt_payment' ? (language === 'mk' ? 'Наплата на долг' : 'Debt Payment')
        : t.type === 'cash_in' ? (language === 'mk' ? 'Службен влез' : 'Cash In')
        : t.type === 'cash_out' ? (language === 'mk' ? 'Службен излез' : 'Cash Out')
        : (language === 'mk' ? 'Продажба' : 'Sale');
      const method = t.paymentMethod === 'cash' ? (language === 'mk' ? 'Готовина' : 'Cash')
        : t.paymentMethod === 'card' ? (language === 'mk' ? 'Картичка' : 'Card')
        : (language === 'mk' ? 'Вересија' : 'Debt');
      const note = (t.notes || '').replace(/[;"\n\r]/g, ' ');

      return [
        `"#${t.id.slice(-8).toUpperCase()}"`,
        `"${dt}"`,
        `"${type}"`,
        `"${method}"`,
        net,
        vat,
        tot,
        `"${note}"`
      ].join(';');
    });

    // UTF-8 BOM for Microsoft Excel compatibility with Macedonian Cyrillic
    const csvContent = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ZEZ-POS_Report_${dateRange}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(language === 'mk' ? 'Извештајот е симнат во Excel (CSV) формат!' : 'Report exported to Excel (CSV)!');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">{language === 'mk' ? 'Финансиски Извештаи' : 'Financial Reports'}</h2>
          <p className="text-zinc-500">{language === 'mk' ? 'Продажба, состојба на каса и контрола на смени' : 'Sales, drawer totals, and shift variance'}</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px] rounded-xl border-zinc-200 bg-white font-semibold">
              <CalendarIcon className="mr-2 h-4 w-4 text-zinc-400" />
              <SelectValue placeholder={language === 'mk' ? 'Избери период' : 'Select period'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t('history.today')}</SelectItem>
              <SelectItem value="yesterday">{t('history.yesterday')}</SelectItem>
              <SelectItem value="this-week">{t('history.thisWeek')}</SelectItem>
              <SelectItem value="this-month">{language === 'mk' ? 'Овој Месец' : 'This Month'}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="border-zinc-200 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 rounded-xl font-bold text-xs h-10 transition-all shadow-xs"
            onClick={handleExportCSV}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
            {language === 'mk' ? 'Експорт Excel (CSV)' : 'Export CSV'}
          </Button>
          <Button className="bg-zinc-900 rounded-xl font-bold text-xs h-10 shadow-xs" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" /> {language === 'mk' ? 'Печати Извештај' : 'Print PDF'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card className="border-zinc-200 shadow-sm rounded-3xl bg-zinc-900 text-white">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-sm font-medium">{language === 'mk' ? 'Вкупен Промет' : 'Gross Sales'}</p>
            <h3 className="text-3xl font-bold mt-2">{formatMKD(totalSales)}</h3>
            <div className="mt-4 flex items-center gap-2 text-zinc-400 text-xs">
              <TrendingUp className="h-3 w-3" />
              <span>{salesTransactions.length} {language === 'mk' ? 'продажни сметки' : 'sales transactions'}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardContent className="p-6">
            <p className="text-zinc-500 text-sm font-medium">{language === 'mk' ? 'Начини на Плаќање' : 'Payment Methods'}</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-green-600" />
                  <span>{t('history.cash')}</span>
                </div>
                <span className="font-bold">{formatMKD(cashSales)}</span>
              </div>
              <div className="flex items-center justify-between gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  <span>{t('history.card')}</span>
                </div>
                <span className="font-bold">{formatMKD(cardSales)}</span>
              </div>
              <div className="flex items-center justify-between gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-amber-600" />
                  <span>{t('history.debt')}</span>
                </div>
                <span className="font-bold">{formatMKD(debtSales)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardContent className="p-6">
            <p className="text-zinc-500 text-sm font-medium">{language === 'mk' ? 'Пресметан ДДВ' : 'Tax Collected'}</p>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span>{language === 'mk' ? 'Вкупно ДДВ' : 'Total DDV'}</span>
                <span className="font-bold">{formatMKD(totalTax)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{language === 'mk' ? 'Нето Промет' : 'Net Sales'}</span>
                <span className="font-bold">{formatMKD(totalSales - totalTax)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardContent className="p-6">
            <p className="text-zinc-500 text-sm font-medium">{language === 'mk' ? 'Тековна Фиока' : 'Active Drawer'}</p>
            <h3 className="text-3xl font-bold mt-2">{formatMKD(expectedCashInDrawer)}</h3>
            <div className="mt-4 flex items-center gap-2 text-xs">
              <Badge
                variant="outline"
                className={activeShift ? 'bg-green-50 text-green-700 border-green-200 font-bold' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}
              >
                {activeShift ? (language === 'mk' ? 'Отворена Смена' : 'Shift Open') : (language === 'mk' ? 'Затворена' : 'Shift Closed')}
              </Badge>
              <span className="text-zinc-500">{language === 'mk' ? 'Вклучен депозит' : 'Opening cash included'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="p-6 border-b border-zinc-100">
            <CardTitle className="text-lg font-bold">{language === 'mk' ? 'Контрола на Смена' : 'Cash Shift Control'}</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{language === 'mk' ? 'Статус на смена' : 'Shift status'}</span>
                <span className="font-semibold">{activeShift ? (language === 'mk' ? 'Отворена' : 'Open') : (language === 'mk' ? 'Затворена' : 'Closed')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{t('shift.cashFloat')}</span>
                <span className="font-semibold">{formatMKD(activeShift?.openingCash || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{t('shift.expectedCash')}</span>
                <span className="font-semibold">{formatMKD(expectedCashInDrawer)}</span>
              </div>
            </div>
            <div className="text-center">
              <span className="text-xs text-zinc-400 font-medium">
                {language === 'mk' ? 'За управување со смени, отворете го јазичето "Смени"' : 'To manage shifts, please open the Shifts tab'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="p-6 border-b border-zinc-100">
            <CardTitle className="text-lg font-bold">{t('shift.recent')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  <TableHead className="pl-6">{language === 'mk' ? 'Отворена' : 'Opened'}</TableHead>
                  <TableHead>{language === 'mk' ? 'Статус' : 'Status'}</TableHead>
                  <TableHead>{language === 'mk' ? 'Очекувано' : 'Expected'}</TableHead>
                  <TableHead className="pr-6 text-right">{t('shift.difference')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentShifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="pl-6 text-sm">{toDateLabel(shift.openedAt, language === 'mk' ? 'mk-MK' : 'en-US')}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={shift.status === 'open' ? 'bg-green-50 text-green-700 border-green-200 font-bold' : 'bg-zinc-100 text-zinc-700 border-zinc-200'}
                      >
                        {shift.status === 'open' ? (language === 'mk' ? 'Отворена' : 'Open') : (language === 'mk' ? 'Затворена' : 'Closed')}
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
                      {t('shift.noHistory')}
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
          <CardTitle className="text-lg font-bold">{language === 'mk' ? 'Последни Трансакции' : 'Recent Transactions'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-50/50">
              <TableRow>
                <TableHead className="pl-6">{language === 'mk' ? 'Број на Сметка' : 'Transaction ID'}</TableHead>
                <TableHead>{language === 'mk' ? 'Датум и Време' : 'Date & Time'}</TableHead>
                <TableHead>{language === 'mk' ? 'Тип' : 'Type'}</TableHead>
                <TableHead>{language === 'mk' ? 'Начин' : 'Method'}</TableHead>
                <TableHead>{language === 'mk' ? 'Данок' : 'Tax'}</TableHead>
                <TableHead className="text-right pr-6">{t('common.total')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id} className="hover:bg-zinc-50/50 transition-colors">
                  <TableCell className="pl-6 font-mono text-xs text-zinc-500">
                    #{transaction.id.slice(-8).toUpperCase()}
                  </TableCell>
                  <TableCell className="text-sm">{toDateLabel(transaction.createdAt, language === 'mk' ? 'mk-MK' : 'en-US')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full capitalize">
                      {transaction.type === 'debt_payment' ? (language === 'mk' ? 'Наплата на долг' : 'Debt payment') : (language === 'mk' ? 'Продажба' : 'Sale')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full capitalize flex items-center w-fit gap-1 font-semibold">
                      {transaction.paymentMethod === 'cash' ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                      {transaction.paymentMethod === 'cash' ? t('history.cash') : transaction.paymentMethod === 'card' ? t('history.card') : t('history.debt')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">{formatMKD(transaction.taxAmount || 0)}</TableCell>
                  <TableCell className="text-right pr-6 font-bold">{formatMKD(transaction.amount || 0)}</TableCell>
                </TableRow>
              ))}
              {filteredTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-zinc-400">
                    {language === 'mk' ? 'Нема пронајдено трансакции за избраниот период' : 'No transactions found for this period'}
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
              <h4 className="font-bold">{t('settings.zReport')}</h4>
              <p className="text-sm text-zinc-500">{language === 'mk' ? 'Нулирање на дневниот промет и фискално затворање' : 'Close shift totals and variance summary'}</p>
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
              <h4 className="font-bold">{t('settings.xReport')}</h4>
              <p className="text-sm text-zinc-500">{language === 'mk' ? 'Преглед на моменталниот промет без затворање' : 'Current shift status without closing'}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-zinc-900" />
        </Card>
      </div>
    </div>
  );
}
