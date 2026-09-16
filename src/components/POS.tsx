import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db, useLiveQuery } from '../lib/db';
import { resolveBusinessConfig } from '../lib/permissions';
import { Business, CashShift, Category, Customer, OrderItem, Product, Table as TableType } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { TableMap } from './TableMap';
import { toast } from 'sonner';
import { ArrowLeft, Barcode, Camera, CreditCard, Minus, Package, Plus, Search, ShoppingCart, Trash2, UserPlus, Weight, X } from 'lucide-react';
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

export function POS() {
  const { profile } = useAuth();
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

  const config = resolveBusinessConfig(business || null);
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

  const { subtotal, taxAmount, total } = computeOrderTotals(cart);

  const addToCart = (product: Product) => {
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

  const handleCheckout = async (paymentMethod: 'cash' | 'card' | 'debt') => {
    if (!profile?.businessId || !profile || cart.length === 0) return;
    if (!activeShift) {
      toast.error('Open a shift before processing sales');
      return;
    }
    if (paymentMethod === 'debt' && !selectedCustomer) {
      setShowCustomerPicker(true);
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
        createdBy: profile.uid,
        createdByName: profile.name,
        createdAt: new Date().toISOString(),
        customerId: selectedCustomer?.id || null,
        paymentMethod,
        shiftId: activeShift.id,
      });
      await db.orders.add(orderRecord);

      const transactionRecord = {
        id: `txn-${Date.now()}`,
        businessId: profile.businessId,
        orderId,
        type: 'sale',
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

      if (selectedCustomer) {
        await db.customers.update(selectedCustomer.id, {
          debt: paymentMethod === 'debt' ? roundDenars((selectedCustomer.debt || 0) + total) : selectedCustomer.debt,
          totalSpent: roundDenars((selectedCustomer.totalSpent || 0) + total),
        });
      }

      if (selectedTable) {
        await db.diningTables.update(selectedTable.id, { status: 'available', currentOrderId: null });
      }

      setCart([]);
      setSelectedCustomer(null);
      if (hospitalityMode) {
        setSelectedTable(null);
        setView('tables');
      }
      toast.success('Order processed successfully');
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
    <div className="flex h-full gap-6 overflow-hidden relative">
      {(hospitalityMode || categories.length > 0) && (
        <div className="hidden lg:flex flex-col w-52 shrink-0 gap-2">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-2 mb-2">Categories</h3>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-2 pr-4">
              <Button variant={selectedCategory === null ? 'default' : 'ghost'} className="justify-start rounded-xl h-12 px-4" onClick={() => setSelectedCategory(null)}>
                All Items
              </Button>
              {categories.map((category) => (
                <Button key={category.id} variant={selectedCategory === category.id ? 'default' : 'ghost'} className="justify-start rounded-xl h-12 px-4" onClick={() => setSelectedCategory(category.id)}>
                  {category.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-col gap-3 shrink-0">
          <div className="flex w-full gap-2 items-center">
            {hospitalityMode && (
              <Button variant="outline" size="icon" className="rounded-xl h-10 w-10 shrink-0" onClick={() => setView('tables')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="relative flex-1">
              {barcodeMode ? <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" /> : <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />}
              <Input ref={barcodeInputRef} placeholder={barcodeMode ? 'Scan or search...' : 'Search products...'} className="pl-10 rounded-xl border-zinc-200 h-10 text-sm" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            </div>
            {barcodeMode && typeof window !== 'undefined' && 'mediaDevices' in navigator && (
              <Button variant="outline" size="icon" className="rounded-xl h-10 w-10 shrink-0" onClick={() => setShowScanner(true)} title="Scan with camera">
                <Camera className="h-5 w-5" />
              </Button>
            )}
          </div>

          <ScrollArea className="w-full whitespace-nowrap lg:hidden">
            <div className="flex gap-2 pb-2">
              <Button variant={selectedCategory === null ? 'default' : 'outline'} className="rounded-full px-4 h-8 text-xs font-medium" onClick={() => setSelectedCategory(null)}>
                All
              </Button>
              {categories.map((category) => (
                <Button key={category.id} variant={selectedCategory === category.id ? 'default' : 'outline'} className="rounded-full px-4 h-8 text-xs font-medium" onClick={() => setSelectedCategory(category.id)}>
                  {category.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 pr-2 pb-4">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="cursor-pointer hover:border-zinc-900 transition-all border-zinc-200 shadow-sm rounded-2xl overflow-hidden group" onClick={() => addToCart(product)}>
                <CardContent className="p-3 flex flex-col items-center text-center gap-2">
                  <div className="w-full aspect-square bg-zinc-50 rounded-xl flex items-center justify-center">
                    {product.isWeightBased ? <Weight className="h-8 w-8 text-zinc-300" /> : <Package className="h-8 w-8 text-zinc-300" />}
                  </div>
                  <h3 className="font-semibold text-sm line-clamp-2 h-10 leading-tight">{product.name}</h3>
                  <p className="text-zinc-900 font-bold text-sm">{formatMKD(product.price)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-3xl flex flex-col shadow-xl overflow-hidden">
        <div className="p-4 lg:p-6 border-b border-zinc-100">
          <div className="flex justify-between items-center">
            <h2 className="text-lg lg:text-xl font-bold">{selectedTable ? `Table ${selectedTable.number}` : `${config.label} Order`}</h2>
            <Badge variant="outline" className="rounded-full">{cart.length} items</Badge>
          </div>
          <p className="mt-2 text-xs uppercase tracking-wider font-bold text-zinc-400">{profile?.name} • {activeShift ? 'Shift open' : 'No shift open'}</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 lg:p-6 space-y-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <ShoppingCart className="h-12 w-12 mb-4 opacity-20" />
                <p>Cart is empty</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={`${item.productId}-${item.notes || ''}`} className="flex justify-between items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-sm line-clamp-1">{item.name}</p>
                    <p className="text-xs text-zinc-500">{formatMKD(item.price)}</p>
                    {item.notes && <p className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded italic mt-1">{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 bg-zinc-50 rounded-lg p-1">
                    <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:bg-white rounded-md transition-colors">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:bg-white rounded-md transition-colors">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button onClick={() => updateQuantity(item.productId, -item.quantity)} className="text-zinc-300 hover:text-red-500 transition-colors p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-4 lg:p-6 bg-zinc-50 border-t border-zinc-200 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Subtotal</span>
              <span>{formatMKD(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Tax (DDV)</span>
              <span>{formatMKD(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-lg lg:text-xl font-bold text-zinc-900 pt-2 border-t border-zinc-200">
              <span>Total</span>
              <span>{formatMKD(total)}</span>
            </div>
          </div>

          {selectedCustomer && <div className="text-sm text-zinc-600">Debt customer: <span className="font-semibold text-zinc-900">{selectedCustomer.name}</span></div>}

          <div className="grid grid-cols-2 gap-3">
            <Button className="h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800" disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('cash')}>
              <ShoppingCart className="mr-2 h-5 w-5" />
              Cash
            </Button>
            <Button variant="outline" className="h-12 rounded-2xl border-zinc-200 hover:bg-zinc-100" disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('card')}>
              <CreditCard className="mr-2 h-5 w-5" />
              Card
            </Button>
            <Button variant="outline" className="h-12 rounded-2xl border-zinc-200 hover:bg-zinc-100" disabled={cart.length === 0 || isProcessing} onClick={() => setShowCustomerPicker(true)}>
              <UserPlus className="mr-2 h-5 w-5" />
              Debt
            </Button>
            <Button variant="outline" className="h-12 rounded-2xl border-zinc-200 hover:bg-zinc-100" disabled={cart.length === 0} onClick={() => setCart([])}>
              <Trash2 className="mr-2 h-5 w-5" />
              Clear
            </Button>
          </div>
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
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setShowCustomerPicker(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-zinc-900 text-white rounded-xl h-12"
                  disabled={!selectedCustomer}
                  onClick={() => {
                    setShowCustomerPicker(false);
                    handleCheckout('debt');
                  }}
                >
                  Confirm Debt
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
              <Input type="number" step="0.001" value={weightValue} onChange={(event) => setWeightValue(event.target.value)} />
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
    </div>
  );
}
