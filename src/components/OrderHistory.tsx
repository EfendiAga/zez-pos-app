import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, CreditCard, Eye, History, Printer, RotateCcw, Search, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { db, useLiveQuery } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { Order, Shift, Transaction, UserProfile } from '../types';
import { formatMKD } from '../lib/money';
import { cn } from '../lib/utils';
import { ReceiptModal } from './ReceiptModal';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const DATE_OPTS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' },
];

const METHOD_OPTS = [
  { value: 'all', label: 'All Methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'debt', label: 'Debt' },
];

const getCutoffDate = (dateFilter: string) => {
  const now = new Date();
  if (dateFilter === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start };
  }
  if (dateFilter === 'yesterday') {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (dateFilter === 'this-week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1);
    start.setHours(0, 0, 0, 0);
    return { start };
  }
  return {};
};

export function OrderHistory() {
  const { profile } = useAuth();
  const business = useLiveQuery(() => (profile?.businessId ? db.businesses.get(profile.businessId) : undefined), [profile?.businessId]) || null;
  const transactions = (useLiveQuery<Transaction[]>(
    () => (profile?.businessId ? db.transactions.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Transaction[];
  const orders = (useLiveQuery<Order[]>(
    () => (profile?.businessId ? db.orders.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Order[];
  const users = (useLiveQuery<UserProfile[]>(
    () => (profile?.businessId ? db.users.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as UserProfile[];
  const shifts = (useLiveQuery<Shift[]>(
    () => (profile?.businessId ? db.shifts.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Shift[];

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [refundConfirm, setRefundConfirm] = useState<Transaction | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [receiptData, setReceiptData] = useState<{ order: Order; transaction: Transaction } | null>(null);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const { start, end } = getCutoffDate(dateFilter);

    return [...transactions]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .filter((transaction) => {
        const order = orders.find((entry) => entry.id === transaction.orderId);
        const searchable = [transaction.id, transaction.orderId || '', transaction.createdByName || '', order?.tableNumber || ''].join(' ').toLowerCase();
        const createdAt = new Date(transaction.createdAt);
        const matchesSearch = !query || searchable.includes(query);
        const matchesMethod = methodFilter === 'all' || transaction.paymentMethod === methodFilter;
        const matchesUser = userFilter === 'all' || transaction.createdBy === userFilter;
        const matchesShift = shiftFilter === 'all' || transaction.shiftId === shiftFilter;
        const matchesStart = !start || createdAt >= start;
        const matchesEnd = !end || createdAt <= end;
        return matchesSearch && matchesMethod && matchesUser && matchesShift && matchesStart && matchesEnd;
      });
  }, [transactions, orders, searchQuery, dateFilter, methodFilter, userFilter, shiftFilter]);

  const handleViewDetails = async (transaction: Transaction) => {
    const order = orders.find((entry) => entry.id === transaction.orderId) || null;
    if (!order) {
      toast.error('Order not found');
      return;
    }
    setSelectedTxn(transaction);
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  const handlePrintFromHistory = async (transaction: Transaction) => {
    const order = orders.find((entry) => entry.id === transaction.orderId);
    if (!order) {
      toast.error('Order data not found for re-print');
      return;
    }
    setReceiptData({ order, transaction });
  };

  const handleRefund = async (transaction: Transaction) => {
    if (!profile?.businessId) return;
    setIsRefunding(true);
    try {
      await db.transactions.add({
        id: `refund-${Date.now()}`,
        orderId: transaction.orderId,
        amount: -Math.abs(transaction.amount),
        netAmount: -Math.abs(transaction.netAmount || transaction.amount || 0),
        paymentMethod: transaction.paymentMethod,
        taxAmount: -Math.abs(transaction.taxAmount || 0),
        businessId: profile.businessId,
        createdBy: profile.uid,
        createdByName: profile.name,
        shiftId: transaction.shiftId || null,
        type: 'refund',
        isRefund: true,
        createdAt: new Date().toISOString(),
      });
      if (transaction.orderId) {
        await db.orders.update(transaction.orderId, {
          status: 'refunded',
          paymentStatus: 'refunded',
          closedAt: new Date().toISOString(),
        });
      }
      toast.success('Refund processed');
      setRefundConfirm(null);
    } catch (error) {
      console.error('Refund failed:', error);
      toast.error('Refund failed');
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Order History</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{filteredTransactions.length} transactions</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input placeholder="Search transaction, order, table..." className="pl-10 rounded-xl border-zinc-200" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900">
            {DATE_OPTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900">
            {METHOD_OPTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900">
            <option value="all">All Employees</option>
            {users.map((user) => <option key={user.uid} value={user.uid}>{user.name}</option>)}
          </select>
          <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900">
            <option value="all">All Shifts</option>
            {shifts.map((shift) => <option key={shift.id} value={shift.id}>{new Date(shift.openedAt).toLocaleDateString('mk-MK')} • {shift.openedByName || 'Shift'}</option>)}
          </select>
        </div>
      </div>

      <Card className="border-zinc-100 shadow-sm rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/50">
              <TableRow>
                <TableHead className="pl-6">ID</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>DDV</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id} className={cn('hover:bg-zinc-50/50 transition-colors', transaction.isRefund && 'bg-red-50/30')}>
                  <TableCell className="pl-6 font-mono text-xs text-zinc-500">
                    #{transaction.id.slice(-8).toUpperCase()}
                    {transaction.isRefund && <Badge className="ml-2 text-[10px] bg-red-100 text-red-600 border-red-100 rounded-full">REFUND</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">
                    {new Date(transaction.createdAt).toLocaleString('mk-MK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-zinc-600">
                      <User className="h-3.5 w-3.5" />
                      {transaction.createdByName || users.find((user) => user.uid === transaction.createdBy)?.name || 'Unknown'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full capitalize text-xs flex items-center w-fit gap-1">
                      {transaction.paymentMethod === 'cash' ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                      {transaction.paymentMethod}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">{formatMKD(Math.abs(transaction.taxAmount || 0))}</TableCell>
                  <TableCell className={cn('text-right font-bold', transaction.isRefund ? 'text-red-600' : 'text-zinc-900')}>
                    {transaction.isRefund ? '− ' : ''}{formatMKD(Math.abs(transaction.amount || 0))}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-zinc-100" title="View details" onClick={() => handleViewDetails(transaction)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-zinc-100" title="Re-print receipt" onClick={() => handlePrintFromHistory(transaction)}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      {!transaction.isRefund && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50 hover:text-red-600 text-zinc-400" title="Refund / Void" onClick={() => setRefundConfirm(transaction)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-zinc-400">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p>No orders found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AnimatePresence>
        {isDetailsOpen && selectedOrder && selectedTxn && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsDetailsOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                <h3 className="font-black text-zinc-900">Order #{selectedOrder.id.slice(-8).toUpperCase()}</h3>
                <button onClick={() => setIsDetailsOpen(false)} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-4 w-4 text-zinc-400" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex justify-between bg-zinc-50 p-4 rounded-2xl text-sm">
                  <div>
                    <p className="text-xs text-zinc-400 uppercase font-bold">Area</p>
                    <p className="font-black">{selectedOrder.tableNumber ? `Table ${selectedOrder.tableNumber}` : 'Counter Sale'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-400 uppercase font-bold">Employee</p>
                    <p className="font-semibold">{selectedOrder.createdByName || 'Unknown'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedOrder.items.map((item, index) => (
                    <div key={`${selectedOrder.id}-${item.productId}-${index}`} className="flex justify-between items-center p-3 border border-zinc-100 rounded-xl">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{item.name}</p>
                        <p className="text-xs text-zinc-400">{item.quantity} × {formatMKD(item.price)}</p>
                      </div>
                      <p className="font-bold text-sm">{formatMKD(item.quantity * item.price)}</p>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-zinc-100 space-y-1.5">
                  <div className="flex justify-between text-sm text-zinc-500">
                    <span>Subtotal</span>
                    <span>{formatMKD(selectedOrder.subtotal || selectedOrder.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-zinc-500">
                    <span>DDV</span>
                    <span>{formatMKD(selectedOrder.taxAmount || selectedTxn.taxAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between font-black text-lg">
                    <span>Total</span>
                    <span>{formatMKD(selectedOrder.total)}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button className="flex-1 bg-zinc-900 rounded-xl h-12 font-bold" onClick={() => { handlePrintFromHistory(selectedTxn); setIsDetailsOpen(false); }}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                  <Button variant="outline" className="flex-1 rounded-xl h-12 border-zinc-200" onClick={() => setIsDetailsOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {refundConfirm && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRefundConfirm(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
              <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <RotateCcw className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-zinc-900 mb-2">Refund this transaction?</h3>
              <p className="text-zinc-500 text-sm mb-2">
                #{refundConfirm.id.slice(-8).toUpperCase()} — {formatMKD(Math.abs(refundConfirm.amount || 0))}
              </p>
              <p className="text-xs text-zinc-400 mb-8">
                This creates a negative transaction and marks the order as refunded.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setRefundConfirm(null)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-12 font-bold" disabled={isRefunding} onClick={() => handleRefund(refundConfirm)}>
                  {isRefunding ? 'Processing...' : 'Confirm Refund'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {receiptData && (
        <ReceiptModal order={receiptData.order} transaction={receiptData.transaction} business={business} onClose={() => setReceiptData(null)} />
      )}
    </div>
  );
}
