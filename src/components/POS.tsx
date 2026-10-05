import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db, useLiveQuery } from '../lib/db';
import { BAKERY_CONFIG } from '../lib/businessConfig';
import { Business, CashShift, Category, Customer, OrderItem, Product, Table as TableType, ParkedOrder } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { TableMap } from './TableMap';
import { toast } from 'sonner';
import { ArrowLeft, Barcode, Camera, CreditCard, KeyRound, LayoutGrid, List, Loader2, Minus, Package, Plus, Printer, Receipt, ScanLine, Search, Settings, ShoppingCart, Trash2, User, UserPlus, UtensilsCrossed, Weight, X, Clock, Pause, Banknote, SplitSquareHorizontal, Percent, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { printThermalSlip, printFiscalReceipt } from '../lib/printer';
import { cn } from '../lib/utils';
import { computeOrderTotals, formatMKD, roundDenars } from '../lib/money';

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

const getCategoryColor = (categoryId: string | null) => {
  if (!categoryId) return 'bg-zinc-100 text-zinc-600';
  const colors = [
    'bg-blue-50 text-blue-600',
    'bg-emerald-50 text-emerald-600',
    'bg-violet-50 text-violet-600',
    'bg-amber-50 text-amber-600',
    'bg-pink-50 text-pink-600',
    'bg-cyan-50 text-cyan-600',
    'bg-rose-50 text-rose-600',
  ];
  const index = categoryId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
};

import { useI18n } from '../lib/i18n';

export function POS() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerIntervalRef = useRef<number | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);

  const business = useLiveQuery<Business | undefined>(() => (profile?.businessId ? db.businesses.get(profile.businessId) : undefined), [profile?.businessId]);
  const products = (useLiveQuery<Product[]>(() => (profile?.businessId ? db.products.where('businessId').equals(profile.businessId).toArray() : []), [profile?.businessId]) || []) as Product[];
  const categories = (useLiveQuery<Category[]>(() => (profile?.businessId ? db.categories.where('businessId').equals(profile.businessId).toArray() : []), [profile?.businessId]) || []) as Category[];
  const customers = (useLiveQuery<Customer[]>(() => (profile?.businessId ? db.customers.where('businessId').equals(profile.businessId).toArray() : []), [profile?.businessId]) || []) as Customer[];
  const activeShift = useLiveQuery<CashShift | undefined>(
    async () => {
      if (!profile?.businessId) return undefined;
      const openShifts = await db.shifts.where('businessId').equals(profile.businessId).toArray();
      return openShifts
        .filter((shift) => shift.status === 'open')
        .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())[0];
    },
    [profile?.businessId]
  );

  const config = BAKERY_CONFIG;
  const hospitalityMode = Boolean(config?.hasTables);
  const barcodeMode = Boolean(config?.hasBarcodes);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableType | null>(null);
  const [view, setView] = useState<'tables' | 'pos'>(hospitalityMode ? 'tables' : 'pos');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [weightItem, setWeightItem] = useState<Product | null>(null);
  const [weightValue, setWeightValue] = useState('1');

  // New Feature States
  const [showParkedOrders, setShowParkedOrders] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [activeDiscountType, setActiveDiscountType] = useState<'percent' | 'fixed' | undefined>(undefined);
  const [activeDiscountValue, setActiveDiscountValue] = useState<number | undefined>(undefined);
  const [discountPin, setDiscountPin] = useState('');
  
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState('');
  
  const [showQuickCashModal, setShowQuickCashModal] = useState(false);
  
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(true);
  const [isCartExpanded, setIsCartExpanded] = useState(true);
  
  const parkedOrders = (useLiveQuery<ParkedOrder[]>(() => (profile?.businessId ? db.parkedOrders.where('businessId').equals(profile.businessId).toArray() : []), [profile?.businessId]) || []) as ParkedOrder[];
  const users = (useLiveQuery<any[]>(() => (profile?.businessId ? db.users.where('businessId').equals(profile.businessId).toArray() : []), [profile?.businessId]) || []);

  useEffect(() => {
    setView(config?.hasTables ? 'tables' : 'pos');
  }, [config?.hasTables]);

  useEffect(() => {
    if (barcodeMode && view === 'pos') {
      barcodeInputRef.current?.focus();
    }
  }, [barcodeMode, view]);

  useEffect(() => {
    if (!showScanner || !window.BarcodeDetector || !videoRef.current) return;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        scannerStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
        scannerIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current) return;
          const codes = await detector.detect(videoRef.current);
          const rawValue = codes?.[0]?.rawValue;
          if (rawValue) {
            setSearchQuery(rawValue);
            setShowScanner(false);
          }
        }, 500);
      } catch (error) {
        console.error('Scanner failed:', error);
        toast.error('Camera barcode scanning is not available on this device');
        setShowScanner(false);
      }
    };

    startScanner();

    return () => {
      if (scannerIntervalRef.current) window.clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
      scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    };
  }, [showScanner]);

  useEffect(() => {
    if (!barcodeMode || !searchQuery.trim()) return;
    const matchedProduct = products.find((product) => product.barcode === searchQuery.trim());
    if (matchedProduct) {
      addToCart(matchedProduct);
      setSearchQuery('');
      toast.success(`${matchedProduct.name} added`);
    }
  }, [barcodeMode, products, searchQuery]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          (!selectedCategory || product.categoryId === selectedCategory) &&
          product.isActive !== false &&
          product.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [products, selectedCategory, searchQuery]
  );

  const { subtotal, taxAmount, total } = useMemo(() => computeOrderTotals(cart, activeDiscountType, activeDiscountValue), [cart, activeDiscountType, activeDiscountValue]);

  const addToCart = (product: Product) => {
    setIsCartExpanded(true);
    if (product.isWeightBased) {
      setWeightItem(product);
      setWeightValue('1');
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id && !item.notes && !item.selectedModifiers?.length);
      if (existing) {
        return current.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          taxRate: product.taxRate,
          taxGroup: product.taxGroup,
          selectedModifiers: product.modifiers || [],
        },
      ];
    });
  };

  const addWeightedItem = () => {
    if (!weightItem) return;
    const parsedWeight = Number(weightValue);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      toast.error('Enter a valid weight');
      return;
    }

    setCart((current) => [
      ...current,
      {
        productId: weightItem.id,
        name: weightItem.name,
        price: weightItem.price,
        quantity: parsedWeight,
        taxRate: weightItem.taxRate,
        taxGroup: weightItem.taxGroup,
      },
    ]);
    setWeightItem(null);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) =>
      current
        .map((item) => (item.productId === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const parkOrder = async () => {
    if (!profile?.businessId || cart.length === 0) return;
    try {
      await db.parkedOrders.add({
        id: `parked-${Date.now()}`,
        businessId: profile.businessId,
        items: cart,
        customerId: selectedCustomer?.id,
        createdBy: profile.uid,
        createdAt: new Date().toISOString(),
      });
      setCart([]);
      setSelectedCustomer(null);
      setActiveDiscountType(undefined);
      setActiveDiscountValue(undefined);
      toast.success('Order parked successfully', { icon: '⏸️' });
    } catch (e) {
      toast.error('Failed to park order');
    }
  };

  const retrieveParkedOrder = async (parked: ParkedOrder) => {
    setCart(parked.items);
    if (parked.customerId) {
      const cust = customers.find(c => c.id === parked.customerId);
      setSelectedCustomer(cust || null);
    } else {
      setSelectedCustomer(null);
    }
    await db.parkedOrders.delete(parked.id);
    setShowParkedOrders(false);
  };

  const handleCheckout = async (paymentMethod: 'cash' | 'card' | 'debt', splitCardAmount?: number) => {
    if (!profile?.businessId || !profile || cart.length === 0) return;
    if (!activeShift) {
      toast.error('Open a shift before processing sales');
      return;
    }
    if (paymentMethod === 'debt' && !selectedCustomer) {
      setShowCustomerPicker(true);
      return;
    }
    
    // Quick Cash Intercept
    if (paymentMethod === 'cash' && splitCardAmount === undefined && !showQuickCashModal) {
      setShowQuickCashModal(true);
      return;
    }

    setIsProcessing(true);
    try {
      const orderId = `order-${Date.now()}`;
      const kitchenStatus = hospitalityMode ? 'pending' : 'not_required';
      const orderType = hospitalityMode ? 'table' : 'counter';
      const orderRecord = omitUndefined({
        id: orderId,
        businessId: profile.businessId,
        type: orderType,
        tableId: selectedTable?.id,
        tableNumber: selectedTable?.number,
        items: cart,
        subtotal,
        taxAmount,
        total,
        paymentStatus: 'paid',
        kitchenStatus,
        status: hospitalityMode ? 'pending' : 'paid',
        discountType: activeDiscountType,
        discountPercent: activeDiscountType === 'percent' ? activeDiscountValue : undefined,
        discount: activeDiscountValue ? (activeDiscountType === 'percent' ? (subtotal + taxAmount) * (activeDiscountValue / 100) : activeDiscountValue) : undefined,
        createdBy: profile.uid,
        createdByName: profile.name,
        createdAt: new Date().toISOString(),
        customerId: selectedCustomer?.id || null,
        paymentMethod: splitCardAmount ? 'other' : paymentMethod,
        shiftId: activeShift.id,
      });
      await db.orders.add(orderRecord as any);

      if (splitCardAmount !== undefined) {
        const cashAmount = total - splitCardAmount;
        await db.transactions.add({
          id: `txn-cash-${Date.now()}`, businessId: profile.businessId, orderId, type: 'sale', paymentMethod: 'cash',
          amount: cashAmount, netAmount: cashAmount - (cashAmount / total) * taxAmount, taxAmount: (cashAmount / total) * taxAmount,
          customerId: selectedCustomer?.id || null, createdBy: profile.uid, createdByName: profile.name, shiftId: activeShift.id, createdAt: new Date().toISOString(), isSplit: true
        });
        await db.transactions.add({
          id: `txn-card-${Date.now()}`, businessId: profile.businessId, orderId, type: 'sale', paymentMethod: 'card',
          amount: splitCardAmount, netAmount: splitCardAmount - (splitCardAmount / total) * taxAmount, taxAmount: (splitCardAmount / total) * taxAmount,
          customerId: selectedCustomer?.id || null, createdBy: profile.uid, createdByName: profile.name, shiftId: activeShift.id, createdAt: new Date().toISOString(), isSplit: true
        });
      } else {
        const transactionRecord = {
          id: `txn-${Date.now()}`,
          businessId: profile.businessId,
          orderId,
          type: 'sale' as const,
          paymentMethod,
          amount: total,
          netAmount: subtotal,
          taxAmount,
          customerId: selectedCustomer?.id || null,
          createdBy: profile.uid,
          createdByName: profile.name,
          shiftId: activeShift.id,
          createdAt: new Date().toISOString(),
        };
        await db.transactions.add(transactionRecord);
      }

      if (selectedCustomer) {
        await db.customers.update(selectedCustomer.id, {
          debt: paymentMethod === 'debt' ? roundDenars((selectedCustomer.debt || 0) + total) : selectedCustomer.debt,
          totalSpent: roundDenars((selectedCustomer.totalSpent || 0) + total),
        });
      }

      if (selectedTable) {
        await db.diningTables.update(selectedTable.id, { status: 'available', currentOrderId: null });
      }

      // Decrement inventory stock for sold items
      for (const item of cart) {
        const prod = await db.products.get(item.productId);
        if (prod && typeof prod.stockQuantity === 'number') {
          const newStock = Math.max(0, prod.stockQuantity - item.quantity);
          await db.products.update(item.productId, { stockQuantity: newStock });
        }
      }

      setCart([]);
      setSelectedCustomer(null);
      setActiveDiscountType(undefined);
      setActiveDiscountValue(undefined);
      setShowQuickCashModal(false);
      setShowSplitModal(false);
      if (hospitalityMode) {
        setSelectedTable(null);
        setView('tables');
      }

      // Print receipts
      const storeName = business?.name || 'Market POS';
      await printThermalSlip(orderRecord as any, storeName);
      if (paymentMethod !== 'debt') {
        if (splitCardAmount !== undefined) {
          const cashAmt = total - splitCardAmount;
          await printFiscalReceipt(orderRecord as any, 'cash', { cashAmount: cashAmt, cardAmount: splitCardAmount });
        } else {
          await printFiscalReceipt(orderRecord as any, paymentMethod === 'card' ? 'card' : 'cash');
        }
      }

      toast.success(
        hospitalityMode ? 'Order sent to kitchen' : `Payment successful! Order #${orderId.slice(0, 6)}`,
        { icon: '🧾' }
      );
    } catch (error) {
      console.error('Checkout failed:', error);
      toast.error('Checkout failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const startTableOrder = async (table: TableType) => {
    setSelectedTable(table);
    setView('pos');
    if (table.status !== 'occupied') {
      await db.diningTables.update(table.id, { status: 'occupied' });
    }
  };

  if (business === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-full max-w-md rounded-3xl border-zinc-200 shadow-sm">
          <CardContent className="p-8 text-center text-zinc-500">Loading POS workspace...</CardContent>
        </Card>
      </div>
    );
  }

  if (!business || !config) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-full max-w-md rounded-3xl border-zinc-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-bold text-zinc-900">Business unavailable</h3>
            <p className="mt-2 text-zinc-500">This account does not have a valid business workspace loaded for POS yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (hospitalityMode && view === 'tables') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">{config.label} Tables</h2>
            <p className="text-zinc-500">Open a table to create or continue an order.</p>
          </div>
          <Badge variant="outline" className="rounded-full px-4 py-1">{business.name}</Badge>
        </div>
        <TableMap onSelectTable={startTableOrder} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-zinc-50/50">
      
      {/* Top Header / Category Pill Bar - FULL WIDTH */}
      <div className="flex flex-col gap-4 p-4 lg:p-6 shrink-0 bg-white border-b border-zinc-200/60 z-30 shadow-sm w-full">
          {/* Search & Actions */}
          <div className="flex w-full gap-3 items-center">
            {hospitalityMode && (
              <Button variant="outline" size="icon" className="rounded-2xl h-12 w-12 shrink-0 border-zinc-200/60 shadow-sm" onClick={() => setView('tables')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="relative flex-1">
              {barcodeMode ? <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" /> : <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />}
              <Input ref={barcodeInputRef} placeholder={t('pos.searchProducts')} className="pl-12 rounded-2xl border-zinc-200/60 h-12 font-medium bg-zinc-50 shadow-inner" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            </div>
            {barcodeMode && typeof window !== 'undefined' && 'mediaDevices' in navigator && (
              <Button variant="outline" size="icon" className="rounded-2xl h-12 w-12 shrink-0 border-zinc-200/60 shadow-sm" onClick={() => setShowScanner(true)} title="Scan with camera">
                <Camera className="h-5 w-5" />
              </Button>
            )}
            <Button variant="outline" size="icon" className="rounded-2xl h-12 w-12 shrink-0 border-zinc-200/60 shadow-sm xl:hidden" onClick={() => setIsCartExpanded(!isCartExpanded)} title="Toggle Cart">
              <ShoppingCart className="h-5 w-5" />
              {cart.length > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{cart.length}</span>}
            </Button>
          </div>

          {/* Scrollable Horizontal Categories */}
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-1 items-center">
              <Button variant={selectedCategory === null ? 'default' : 'outline'} className={cn("rounded-2xl px-6 h-12 font-bold transition-all shadow-sm border-zinc-200/60", selectedCategory === null ? "bg-zinc-900 text-white border-zinc-900 shadow-md" : "bg-white text-zinc-600 hover:bg-zinc-50 active:scale-[0.98]")} onClick={() => setSelectedCategory(null)}>
                {t('pos.allCategories')}
              </Button>
              {categories.map((category) => (
                <Button key={category.id} variant={selectedCategory === category.id ? 'default' : 'outline'} className={cn("rounded-2xl px-6 h-12 font-bold transition-all shadow-sm border-zinc-200/60", selectedCategory === category.id ? "bg-zinc-900 text-white border-zinc-900 shadow-md" : "bg-white text-zinc-600 hover:bg-zinc-50 active:scale-[0.98]")} onClick={() => setSelectedCategory(category.id)}>
                  {category.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

      {/* Main Content Area (Grid + Floating Cart) */}
      <div className="flex-1 flex overflow-hidden relative w-full">
        
        {/* Product Grid Area */}
        <div className="flex-1 p-4 lg:p-6 overflow-hidden h-full">
          <ScrollArea className="h-full pr-4 -mr-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 pb-12">
              {filteredProducts.map((product) => (
                <button key={product.id} onClick={() => addToCart(product)} className="text-left group flex flex-col bg-white rounded-3xl overflow-hidden hover:shadow-xl transition-all duration-300 border border-zinc-100 hover:border-zinc-300 shadow-sm hover:-translate-y-1">
                  {/* Image Area */}
                  <div className={cn("w-full aspect-[5/4] flex items-center justify-center transition-colors duration-300", getCategoryColor(product.categoryId))}>
                    {product.isWeightBased ? <Weight className="h-10 w-10 opacity-60 group-hover:scale-110 transition-transform duration-300" /> : <Package className="h-10 w-10 opacity-60 group-hover:scale-110 transition-transform duration-300" />}
                  </div>
                  {/* Text Area */}
                  <div className="p-4 flex flex-col gap-1.5 h-24 justify-between bg-white">
                    <h3 className="font-bold text-sm text-zinc-700 line-clamp-2 leading-tight">{product.name}</h3>
                    <p className="text-zinc-900 font-black text-lg tracking-tight">{formatMKD(product.price)}</p>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

      {/* Cart Right Dock (Floating Collapsible) */}
      <div className={cn("bg-white border border-zinc-200/60 rounded-[32px] flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-400 ease-in-out shrink-0 z-20 mt-4 mb-8 mr-4 lg:mr-6 overflow-hidden", isCartExpanded ? "w-full sm:w-[380px]" : "w-0 sm:w-20 items-center")}>
        {isCartExpanded ? (
          <>
            <div className="p-4 border-b border-zinc-100 shrink-0">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black tracking-tight text-zinc-900">{selectedTable ? `Table ${selectedTable.number}` : t('pos.cart')}</h2>
                <div className="flex items-center gap-2">
                  <Badge className="rounded-full bg-zinc-100 text-zinc-800 shadow-sm border-none font-bold px-2 py-0.5">{cart.length} {t('pos.items')}</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-zinc-100 hidden sm:flex" onClick={() => setIsCartExpanded(false)}>
                    <ChevronRight className="h-5 w-5 text-zinc-500" />
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-widest font-bold text-zinc-400">{profile?.name} • {activeShift ? t('nav.shiftOpen') : t('nav.shiftClosed')}</p>
            </div>

            <ScrollArea className="flex-1 bg-zinc-50/30">
              <div className="p-4 space-y-2">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-300">
                    <ShoppingCart className="h-16 w-16 mb-4 opacity-20" />
                    <p className="font-bold text-base text-zinc-400">{t('pos.cartEmpty')}</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={`${item.productId}-${item.notes || ''}`} className="flex justify-between items-center gap-3 bg-white p-3 rounded-2xl border border-zinc-100 shadow-sm group">
                      <div className="flex-1">
                        <p className="font-bold text-sm text-zinc-900 line-clamp-1">{item.name}</p>
                        <p className="text-xs text-zinc-500 font-semibold mt-0.5">{formatMKD(item.price)}</p>
                        {item.notes && <p className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded-md font-medium mt-1 w-fit">{item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 bg-zinc-50 rounded-xl p-1 border border-zinc-100">
                        <button onClick={() => updateQuantity(item.productId, -1)} className="p-1.5 bg-white hover:bg-zinc-100 rounded-lg transition-colors shadow-sm active:scale-95">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-black w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.productId, 1)} className="p-1.5 bg-white hover:bg-zinc-100 rounded-lg transition-colors shadow-sm active:scale-95">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="p-4 pb-6 bg-white border-t border-zinc-100 space-y-4 shrink-0">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-zinc-500 font-bold uppercase tracking-wider">
                  <span>{t('pos.subtotal')}</span>
                  <span className="text-zinc-900">{formatMKD(subtotal)}</span>
                </div>
                {activeDiscountValue && activeDiscountValue > 0 && (
                  <div className="flex justify-between text-xs font-black text-emerald-600 uppercase tracking-wider">
                    <span>{t('pos.discount')} {activeDiscountType === 'percent' ? `(${activeDiscountValue}%)` : ''}</span>
                    <span>- {formatMKD(activeDiscountType === 'percent' ? (subtotal + taxAmount) * (activeDiscountValue / 100) : activeDiscountValue)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-zinc-500 font-bold uppercase tracking-wider">
                  <span>{t('pos.tax')}</span>
                  <span className="text-zinc-900">{formatMKD(taxAmount)}</span>
                </div>
                <div className="flex justify-between text-2xl font-black text-zinc-900 pt-2 border-t border-zinc-100 mt-2">
                  <span>{t('common.total')}</span>
                  <span className="tracking-tight">{formatMKD(total)}</span>
                </div>
              </div>

              {selectedCustomer && <div className="text-xs text-zinc-600 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 font-medium">{t('pos.customerDebt')}: <span className="font-bold text-zinc-900">{selectedCustomer.name}</span></div>}

              <div className="grid grid-cols-4 gap-2 pt-1">
                <Button variant="outline" className="h-10 rounded-xl text-xs font-bold bg-zinc-50 border-zinc-200/60 hover:bg-zinc-100 transition-colors shadow-sm active:scale-[0.98]" disabled={cart.length === 0} onClick={() => setShowDiscountModal(true)} title={t('pos.discount')}>
                  <Percent className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-10 rounded-xl text-xs font-bold bg-zinc-50 border-zinc-200/60 hover:bg-zinc-100 transition-colors shadow-sm active:scale-[0.98]" disabled={cart.length === 0} onClick={parkOrder} title={t('pos.parkOrder')}>
                  <Pause className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-10 rounded-xl text-xs font-bold bg-zinc-50 border-zinc-200/60 hover:bg-zinc-100 transition-colors shadow-sm active:scale-[0.98]" onClick={() => setShowParkedOrders(true)} title={t('pos.parkedOrders')}>
                  <Clock className="h-4 w-4" />
                  {parkedOrders.length > 0 && <span className="ml-1 text-[10px] text-white bg-indigo-600 rounded-full h-4 w-4 flex items-center justify-center absolute -top-1 -right-1 shadow-sm">{parkedOrders.length}</span>}
                </Button>
                <Button variant="outline" className="h-10 rounded-xl text-xs font-bold bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:text-red-700 transition-colors shadow-sm active:scale-[0.98]" disabled={cart.length === 0} onClick={() => { setCart([]); setActiveDiscountType(undefined); setActiveDiscountValue(undefined); }} title={t('pos.clearCart')}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button className="h-14 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white shadow-lg shadow-zinc-900/20 font-black text-base transition-all active:scale-[0.98]" disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('cash')}>
                  {t('pos.payCash')}
                </Button>
                <Button variant="outline" className="h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 font-black text-base transition-all border-none active:scale-[0.98]" disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('card')}>
                  {t('pos.payCard')}
                </Button>
                <Button variant="outline" className="h-10 rounded-xl border-zinc-200/60 bg-white hover:bg-zinc-50 font-bold text-xs transition-all shadow-sm active:scale-[0.98]" disabled={cart.length === 0 || isProcessing} onClick={() => setShowSplitModal(true)}>
                  {t('pos.paySplit')}
                </Button>
                <Button variant="outline" className="h-10 rounded-xl border-zinc-200/60 bg-white hover:bg-zinc-50 font-bold text-xs transition-all shadow-sm active:scale-[0.98]" disabled={cart.length === 0 || isProcessing} onClick={() => setShowCustomerPicker(true)}>
                  {t('pos.customerDebt')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-6 h-full cursor-pointer hover:bg-zinc-50 transition-colors w-full relative" onClick={() => setIsCartExpanded(true)}>
            <div className="relative mb-8 p-4 bg-zinc-100 rounded-3xl mt-4">
              <ShoppingCart className="h-8 w-8 text-zinc-900" />
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold h-7 w-7 flex items-center justify-center rounded-full shadow-md">
                  {cart.length}
                </span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center opacity-30">
              <span className="text-base font-black tracking-[0.4em] uppercase text-zinc-900 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                CURRENT ORDER
              </span>
            </div>
            <div className="mt-8 mb-8">
              <span className="font-black text-2xl text-zinc-900 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                {formatMKD(total)}
              </span>
            </div>
          </div>
        )}
      </div>
      
      </div>

      {showCustomerPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <CardHeader className="bg-zinc-50 border-b border-zinc-100">
              <CardTitle className="text-xl font-bold">Select Customer</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-2 max-h-80 overflow-auto">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    className={cn(
                      'w-full p-4 rounded-2xl text-left transition-all border',
                      selectedCustomer?.id === customer.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-100 hover:border-zinc-900'
                    )}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <div className="font-bold">{customer.name}</div>
                    <div className={cn('text-xs', selectedCustomer?.id === customer.id ? 'text-zinc-400' : 'text-zinc-500')}>Current Debt: {formatMKD(customer.debt || 0)}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4">
                <Button variant="outline" className="rounded-xl h-12 font-bold" onClick={() => setShowCustomerPicker(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  className="bg-zinc-900 text-white rounded-xl h-12 font-bold"
                  disabled={!selectedCustomer}
                  onClick={() => {
                    setShowCustomerPicker(false);
                    handleCheckout('debt');
                  }}
                >
                  {t('pos.customerDebt')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {weightItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl shadow-2xl">
            <CardHeader>
              <CardTitle>Enter Weight</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Input type="number" step="0.001" inputMode="decimal" autoFocus className="h-12 text-center text-xl font-bold rounded-xl" placeholder="0.000" value={weightValue} onChange={(event) => setWeightValue(event.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setWeightItem(null)}>
                  Cancel
                </Button>
                <Button className="bg-zinc-900 text-white rounded-xl h-12" onClick={addWeightedItem}>
                  Add Item
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl overflow-hidden bg-black">
            <button className="absolute top-3 right-3 z-10 rounded-full bg-white/10 p-2 text-white" onClick={() => setShowScanner(false)}>
              <X className="h-5 w-5" />
            </button>
            <video ref={videoRef} className="w-full aspect-video object-cover" muted playsInline />
          </div>
        </div>
      )}
      
      {/* Quick Cash Modal */}
      {showQuickCashModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl shadow-2xl">
            <CardHeader className="bg-zinc-50 border-b border-zinc-100">
              <CardTitle className="text-xl font-bold text-center">{t('pos.quickCash')}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <p className="text-sm text-zinc-500 font-semibold">{t('pos.totalPayable')}</p>
                <p className="text-4xl font-black text-zinc-900">{formatMKD(total)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <Button variant="outline" className="h-14 text-lg font-bold border-zinc-300" onClick={() => handleCheckout('cash')}>
                  {t('pos.payCash')}
                </Button>
                {[...new Set([100, 200, 500, 1000, 2000].filter(n => n > total).sort((a,b)=>a-b).slice(0, 3))].map(preset => (
                   <Button key={preset} variant="outline" className="h-14 text-lg font-bold border-zinc-300 hover:bg-zinc-50" onClick={() => {
                     const change = preset - total;
                     toast.success(`${t('pos.changeDue')}: ${formatMKD(change)}`, { duration: 5000, icon: '💵' });
                     handleCheckout('cash');
                   }}>
                     {preset}
                   </Button>
                ))}
              </div>
              <Button className="w-full h-14 rounded-xl bg-zinc-900 text-white font-bold" onClick={() => setShowQuickCashModal(false)}>{t('common.cancel')}</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Split Modal */}
      {showSplitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl shadow-2xl">
            <CardHeader className="bg-zinc-50 border-b border-zinc-100">
              <CardTitle className="text-xl font-bold text-center">{t('pos.paySplit')}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <p className="text-sm text-zinc-500 font-semibold">{t('pos.totalPayable')}</p>
                <p className="text-3xl font-black text-zinc-900">{formatMKD(total)}</p>
              </div>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-sm font-bold">{t('pos.splitCash')}</label>
                  <Input type="number" className="h-14 text-2xl text-center mt-1 border-zinc-300" value={splitCashAmount} onChange={e => setSplitCashAmount(e.target.value)} placeholder="0" />
                </div>
                {Number(splitCashAmount) > 0 && Number(splitCashAmount) < total && (
                  <div className="text-center p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-sm text-zinc-500">{t('pos.splitCard')}</p>
                    <p className="text-2xl font-bold text-zinc-900 mt-1">{formatMKD(total - Number(splitCashAmount))}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-14 rounded-xl border-zinc-300 font-bold" onClick={() => setShowSplitModal(false)}>{t('common.cancel')}</Button>
                <Button className="h-14 rounded-xl bg-zinc-900 text-white font-bold" disabled={!splitCashAmount || Number(splitCashAmount) <= 0 || Number(splitCashAmount) >= total} onClick={() => handleCheckout('cash', total - Number(splitCashAmount))}>{t('nav.confirm')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl shadow-2xl">
            <CardHeader className="bg-zinc-50 border-b border-zinc-100">
              <CardTitle className="text-xl font-bold text-center">{t('pos.applyDiscount')}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex gap-2 mb-4">
                <Button variant={discountType === 'percent' ? 'default' : 'outline'} className={cn("flex-1 h-12 font-bold rounded-xl", discountType === 'percent' && "bg-zinc-900 text-white")} onClick={() => setDiscountType('percent')}>{t('pos.discountPercent')}</Button>
                <Button variant={discountType === 'fixed' ? 'default' : 'outline'} className={cn("flex-1 h-12 font-bold rounded-xl", discountType === 'fixed' && "bg-zinc-900 text-white")} onClick={() => setDiscountType('fixed')}>{t('pos.discountFixed')}</Button>
              </div>
              <Input type="number" className="h-14 text-2xl text-center mb-6 border-zinc-300" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder="0" />
              
              <div className="mb-6 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block text-center mb-2">{t('pos.discountPin')}</label>
                <Input type="password" placeholder="***" className="h-12 text-center text-xl tracking-widest bg-white border-zinc-300" value={discountPin} onChange={e => setDiscountPin(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-14 rounded-xl border-zinc-300 font-bold" onClick={() => setShowDiscountModal(false)}>{t('common.cancel')}</Button>
                <Button className="h-14 rounded-xl bg-zinc-900 text-white font-bold" onClick={() => {
                  const val = Number(discountValue);
                  if (val > 0) {
                    if ((discountType === 'percent' && val > 20) || (discountType === 'fixed' && val > 500)) {
                      // Check PIN
                      const owner = users.find(u => u.role === 'owner' || u.role === 'manager');
                      if (!owner || owner.pin !== discountPin) {
                        toast.error('Invalid Manager PIN required for high discount');
                        return;
                      }
                      toast.success('Manager override approved', { icon: '🔐' });
                    }
                    setActiveDiscountType(discountType);
                    setActiveDiscountValue(val);
                    setShowDiscountModal(false);
                    setDiscountPin('');
                  }
                }}>{t('nav.confirm')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Parked Orders Modal */}
      {showParkedOrders && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            <CardHeader className="bg-zinc-50 border-b border-zinc-100 flex flex-row justify-between items-center sticky top-0 z-10 rounded-t-3xl p-4">
              <CardTitle className="text-xl font-bold">{t('pos.parkedOrders')}</CardTitle>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowParkedOrders(false)}><X className="h-5 w-5"/></Button>
            </CardHeader>
            <ScrollArea className="flex-1 p-6">
              {parkedOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                  <Pause className="h-12 w-12 mb-4 opacity-20" />
                  <p>No held orders</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {parkedOrders.map(parked => (
                    <div key={parked.id} className="p-4 rounded-2xl border border-zinc-200 flex justify-between items-center hover:border-zinc-900 transition-colors cursor-pointer bg-white group" onClick={() => retrieveParkedOrder(parked)}>
                      <div>
                        <p className="font-bold text-zinc-900 group-hover:text-black">{parked.items.length} items</p>
                        <p className="text-sm text-zinc-500">{new Date(parked.createdAt).toLocaleTimeString()}</p>
                      </div>
                      <Button variant="outline" className="rounded-xl border-zinc-300">Retrieve</Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>
      )}

    </div>
  );
}
