import { useMemo, useState } from 'react';
import { DollarSign, Package, ShoppingBag, TrendingUp, Users, Utensils } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { db, useLiveQuery } from '../lib/db';
import { formatMKD, roundDenars } from '../lib/money';
import { Business, Order, Product, Shift, Transaction, UserProfile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const startForRange = (range: string) => {
  const now = new Date();
  const start = new Date();
  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === 'this-week') {
    start.setDate(now.getDate() - now.getDay() + 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  start.setDate(now.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return start;
};

export function Analytics() {
  const { profile } = useAuth();
  const [dateRange, setDateRange] = useState('today');

  const business = useLiveQuery<Business | undefined>(() => (profile?.businessId ? db.businesses.get(profile.businessId) : undefined), [profile?.businessId]);
  const transactions = (useLiveQuery<Transaction[]>(
    () => (profile?.businessId ? db.transactions.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Transaction[];
  const orders = (useLiveQuery<Order[]>(
    () => (profile?.businessId ? db.orders.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Order[];
  const products = (useLiveQuery<Product[]>(
    () => (profile?.businessId ? db.products.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Product[];
  const shifts = (useLiveQuery<Shift[]>(
    () => (profile?.businessId ? db.shifts.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Shift[];
  const users = (useLiveQuery<UserProfile[]>(
    () => (profile?.businessId ? db.users.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as UserProfile[];

  const cutoff = startForRange(dateRange);
  
  const allPeriodTransactions = useMemo(
    () => transactions.filter((transaction) => new Date(transaction.createdAt).getTime() >= cutoff.getTime()),
    [transactions, cutoff]
  );

  const filteredTransactions = useMemo(
    () => allPeriodTransactions.filter((transaction) => !transaction.isRefund && (transaction.amount || 0) > 0),
    [allPeriodTransactions]
  );

  const refundTransactions = useMemo(
    () => allPeriodTransactions.filter((transaction) => transaction.isRefund || (transaction.amount || 0) < 0),
    [allPeriodTransactions]
  );

  const filteredOrders = useMemo(
    () => orders.filter((order) => new Date(order.createdAt).getTime() >= cutoff.getTime()),
    [orders, cutoff]
  );

  const lowStockProducts = products.filter((product) => product.stockQuantity <= 10);
  const openShift = shifts.find((shift) => shift.status === 'open');
  const openShiftOpeningCash = roundDenars(openShift?.openingCash || 0);
  
  const grossSalesTotal = roundDenars(filteredTransactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0));
  const refundsTotal = roundDenars(Math.abs(refundTransactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0)));
  const netSalesTotal = roundDenars(grossSalesTotal - refundsTotal);
  
  const taxTotal = roundDenars(filteredTransactions.reduce((sum, transaction) => sum + Math.max(0, transaction.taxAmount || 0), 0));
  const cashTotal = roundDenars(allPeriodTransactions.filter((transaction) => transaction.paymentMethod === 'cash').reduce((sum, transaction) => sum + transaction.amount, 0));
  const cardTotal = roundDenars(allPeriodTransactions.filter((transaction) => transaction.paymentMethod === 'card').reduce((sum, transaction) => sum + transaction.amount, 0));

  const topProducts = [...filteredOrders.flatMap((order) => order.items)].reduce<Record<string, { name: string; qty: number }>>((acc, item) => {
    acc[item.productId] = acc[item.productId] || { name: item.name, qty: 0 };
    acc[item.productId].qty += Number(item.quantity);
    return acc;
  }, {});
  const topProductList = Object.values(topProducts).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const salesByEmployee = users
    .map((user) => ({
      name: user.name,
      total: roundDenars(filteredTransactions.filter((transaction) => transaction.createdBy === user.uid).reduce((sum, transaction) => sum + transaction.amount, 0)),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const summaryCards = [
    { label: 'Net Sales', value: formatMKD(netSalesTotal), icon: DollarSign, hint: `${formatMKD(grossSalesTotal)} gross` },
    { label: 'Total Refunds', value: formatMKD(refundsTotal), icon: Utensils, hint: `${refundTransactions.length} refunded items` },
    { label: 'Orders', value: String(filteredOrders.length), icon: ShoppingBag, hint: `${filteredTransactions.length} successful transactions` },
    {
      label: business?.type === 'restaurant' || business?.type === 'coffee' ? 'Open Shift Cash' : 'Cash vs Card',
      value: formatMKD(openShift ? openShiftOpeningCash : cashTotal),
      icon: business?.type === 'restaurant' || business?.type === 'coffee' ? Utensils : Users,
      hint: business?.type === 'restaurant' || business?.type === 'coffee' ? (openShift ? 'Active drawer amount' : 'No shift open') : `${formatMKD(cardTotal)} card`,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Business Dashboard</h2>
          <p className="text-zinc-500">Only live metrics from recorded sales, orders, shifts, and stock.</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px] rounded-xl border-zinc-200 bg-white">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="last-30-days">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border-zinc-200/60 shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl bg-white">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{card.label}</p>
                  <h3 className="text-4xl font-black mt-3 text-zinc-900 tracking-tight">{card.value}</h3>
                </div>
                <div className="p-3 bg-indigo-50/80 rounded-2xl">
                  <card.icon className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
              <p className="mt-6 text-xs font-semibold text-zinc-500">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-zinc-200/60 shadow-sm rounded-3xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black tracking-tight text-zinc-900">Top Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topProductList.length === 0 && <p className="text-zinc-400 text-sm font-medium">No sales yet for this period.</p>}
            {topProductList.map((product) => (
              <div key={product.name} className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50/50 border border-zinc-100 hover:border-zinc-200 transition-colors">
                <span className="font-bold text-zinc-900">{product.name}</span>
                <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{product.qty} sold</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 shadow-sm rounded-3xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black tracking-tight text-zinc-900">Sales by Employee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {salesByEmployee.length === 0 && <p className="text-zinc-400 text-sm font-medium">No attributed sales yet.</p>}
            {salesByEmployee.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50/50 border border-zinc-100 hover:border-zinc-200 transition-colors">
                <span className="font-bold text-zinc-900">{entry.name}</span>
                <span className="text-sm font-black text-indigo-600">{formatMKD(entry.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 shadow-sm rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Operational Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-zinc-50">
            <p className="text-sm text-zinc-500">Low Stock Products</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{lowStockProducts.length}</p>
            <p className="mt-2 text-xs text-zinc-500">{lowStockProducts.slice(0, 3).map((product) => product.name).join(', ') || 'No low stock alerts'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-50">
            <p className="text-sm text-zinc-500">Open Shift</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{openShift ? 'Yes' : 'No'}</p>
            <p className="mt-2 text-xs text-zinc-500">{openShift ? `${formatMKD(openShiftOpeningCash)} opening cash` : 'Open a shift to start cash sales'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-50">
            <p className="text-sm text-zinc-500">Inventory Records</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{products.length}</p>
            <p className="mt-2 text-xs text-zinc-500">{business?.type === 'market' || business?.type === 'pastry_bakery' ? 'Barcode-aware inventory active' : 'Menu and stock linked to sales'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
