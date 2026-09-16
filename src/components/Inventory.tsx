import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, Layers, Package, Pencil, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { db, useLiveQuery } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { formatMKD, roundDenars } from '../lib/money';
import { Category, Product } from '../types';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

function NativeSelect({ value, onChange, options, placeholder }: { value: string; onChange: (value: string) => void; options: { id: string; name: string }[]; placeholder?: string }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 pr-9 text-sm text-zinc-900 appearance-none focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
    </div>
  );
}

export function Inventory() {
  const { profile } = useAuth();
  const products = (useLiveQuery(
    () => (profile?.businessId ? db.products.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Product[];
  const categories = (useLiveQuery(
    () => (profile?.businessId ? db.categories.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Category[];

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stock, setStock] = useState('0');
  const [unit, setUnit] = useState<'piece' | 'kg' | 'liter'>('piece');
  const [taxRate, setTaxRate] = useState('18');
  const [taxGroup, setTaxGroup] = useState<'A' | 'B' | 'V' | 'G'>('A');
  const [barcode, setBarcode] = useState('');
  const [modifiers, setModifiers] = useState('');

  const resetForm = () => {
    setName('');
    setPrice('');
    setCategoryId('');
    setStock('0');
    setUnit('piece');
    setTaxRate('18');
    setTaxGroup('A');
    setBarcode('');
    setModifiers('');
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId) return;
    if (!categoryId) {
      toast.error('Please select a category');
      return;
    }

    setLoading(true);
    try {
      const productData = {
        businessId: profile.businessId,
        name,
        price: roundDenars(parseFloat(price)),
        categoryId,
        stockQuantity: parseFloat(stock),
        unit,
        taxRate: parseFloat(taxRate),
        taxGroup,
        ...(barcode ? { barcode } : {}),
        modifiers: modifiers ? modifiers.split(',').map((modifier) => modifier.trim()).filter(Boolean) : [],
        isWeightBased: unit === 'kg',
      };

      if (editingProduct) {
        await db.products.update(editingProduct.id, productData);
        toast.success('Product updated');
      } else {
        await db.products.add({ id: `product-${Date.now()}`, ...productData });
        toast.success('Product added');
      }

      setIsAddOpen(false);
      setEditingProduct(null);
      resetForm();
    } catch (error) {
      console.error('Failed to save product:', error);
      toast.error('Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setPrice(String(product.price));
    setCategoryId(product.categoryId);
    setStock(String(product.stockQuantity));
    setUnit(product.unit);
    setTaxRate(String(product.taxRate || 18));
    setTaxGroup(product.taxGroup || 'A');
    setBarcode(product.barcode || '');
    setModifiers(product.modifiers?.join(', ') || '');
    setIsAddOpen(true);
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    try {
      await db.products.delete(productToDelete.id);
      toast.success('Product deleted');
      setProductToDelete(null);
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast.error('Failed to delete product');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !newCatName.trim()) return;
    try {
      await db.categories.add({
        id: `cat-${Date.now()}`,
        businessId: profile.businessId,
        name: newCatName.trim(),
      });
      toast.success('Category added');
      setNewCatName('');
    } catch (error) {
      console.error('Failed to add category:', error);
      toast.error('Failed to add category');
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    const productsInCategory = products.filter((product) => product.categoryId === category.id);
    if (productsInCategory.length > 0) {
      toast.error(`Cannot delete: ${productsInCategory.length} products use this category`);
      return;
    }
    await db.categories.delete(category.id);
    toast.success('Category removed');
  };

  const filteredProducts = products.filter((product) => (!selectedCategory || product.categoryId === selectedCategory) && product.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const lowStockCount = products.filter((product) => product.stockQuantity < 10).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Inventory</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{products.length} products • {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl border-zinc-200 gap-2" onClick={() => setIsCatOpen(true)}>
            <Layers className="h-4 w-4" />
            Categories
          </Button>
          <Button className="bg-zinc-900 hover:bg-zinc-800 rounded-xl gap-2" onClick={() => { resetForm(); setEditingProduct(null); setIsAddOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {lowStockCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium"><strong>{lowStockCount} items</strong> are running low on stock</p>
        </motion.div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input placeholder="Search products..." className="pl-10 rounded-xl border-zinc-200 h-11" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSelectedCategory(null)} className={cn('px-4 h-11 rounded-full text-sm font-semibold border transition-all', selectedCategory === null ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400')}>
            All ({products.length})
          </button>
          {categories.map((category) => (
            <button key={category.id} onClick={() => setSelectedCategory(category.id)} className={cn('px-4 h-11 rounded-full text-sm font-semibold border transition-all', selectedCategory === category.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400')}>
              {category.name} ({products.filter((product) => product.categoryId === category.id).length})
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-zinc-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/80 hover:bg-zinc-50">
                <TableHead className="w-[280px] font-bold text-zinc-700">Product</TableHead>
                <TableHead className="font-bold text-zinc-700">Category</TableHead>
                <TableHead className="font-bold text-zinc-700">Price</TableHead>
                <TableHead className="font-bold text-zinc-700">Stock</TableHead>
                <TableHead className="font-bold text-zinc-700">Tax</TableHead>
                <TableHead className="text-right font-bold text-zinc-700">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="hover:bg-zinc-50/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900">{product.name}</p>
                          {product.barcode && <p className="text-xs text-zinc-400 font-mono">{product.barcode}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full border-zinc-200 text-zinc-600 font-medium">
                        {categories.find((category) => category.id === product.categoryId)?.name || 'Uncategorized'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold text-zinc-900">{formatMKD(product.price)}</TableCell>
                    <TableCell>
                      <span className={cn('font-bold text-sm', product.stockQuantity < 10 ? 'text-red-600' : product.stockQuantity < 30 ? 'text-amber-600' : 'text-emerald-600')}>
                        {product.stockQuantity} {product.unit}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full font-mono text-xs">
                        {product.taxGroup} • {product.taxRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-zinc-100" onClick={() => handleEdit(product)}>
                          <Pencil className="h-4 w-4 text-zinc-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setProductToDelete(product)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </AnimatePresence>
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-zinc-400">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No products found</p>
                    <p className="text-sm mt-1">Add your first product to get started</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setIsAddOpen(false); setEditingProduct(null); resetForm(); }} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="relative z-10 w-full max-w-[520px] bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-zinc-900">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">Fill in the product details below</p>
                </div>
                <button onClick={() => { setIsAddOpen(false); setEditingProduct(null); resetForm(); }} className="p-2 rounded-xl hover:bg-zinc-100 transition-colors">
                  <X className="h-5 w-5 text-zinc-500" />
                </button>
              </div>

              <form onSubmit={handleAddProduct} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Product Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Espresso, Margherita Pizza..." className="rounded-xl border-zinc-200 h-11" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-zinc-700">Category *</Label>
                    <NativeSelect value={categoryId} onChange={setCategoryId} placeholder="-- Select category --" options={categories.map((category) => ({ id: category.id, name: category.name }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-zinc-700">Unit</Label>
                    <NativeSelect value={unit} onChange={(value) => setUnit(value as 'piece' | 'kg' | 'liter')} options={[{ id: 'piece', name: 'Piece' }, { id: 'kg', name: 'Kilogram' }, { id: 'liter', name: 'Liter' }]} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-zinc-700">Price *</Label>
                    <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required min="0" step="1" placeholder="0" className="rounded-xl border-zinc-200 h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-zinc-700">Stock Quantity *</Label>
                    <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} required min="0" placeholder="0" className="rounded-xl border-zinc-200 h-11" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-zinc-700">Tax Group</Label>
                    <NativeSelect value={taxGroup} onChange={(value) => {
                      setTaxGroup(value as 'A' | 'B' | 'V' | 'G');
                      if (value === 'A') setTaxRate('18');
                      if (value === 'B') setTaxRate('5');
                      if (value === 'G') setTaxRate('10');
                      if (value === 'V') setTaxRate('0');
                    }} options={[{ id: 'A', name: 'A - 18%' }, { id: 'B', name: 'B - 5%' }, { id: 'G', name: 'G - 10%' }, { id: 'V', name: 'V - 0%' }]} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-zinc-700">Tax Rate (%)</Label>
                    <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} required min="0" max="100" className="rounded-xl border-zinc-200 h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Barcode (optional)</Label>
                  <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type barcode..." className="rounded-xl border-zinc-200 h-11 font-mono" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Modifiers</Label>
                  <Input value={modifiers} onChange={(e) => setModifiers(e.target.value)} placeholder="Extra Shot, Oat Milk, No Sugar" className="rounded-xl border-zinc-200 h-11" />
                </div>

                <Button type="submit" className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold" disabled={loading}>
                  {loading ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCatOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsCatOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="relative z-10 w-full max-w-[420px] bg-white rounded-3xl shadow-2xl">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-zinc-900">Categories</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">Manage your product categories</p>
                </div>
                <button onClick={() => setIsCatOpen(false)} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <form onSubmit={handleAddCategory} className="flex gap-2">
                  <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="New category name..." className="rounded-xl border-zinc-200 h-11 flex-1" />
                  <Button type="submit" className="bg-zinc-900 rounded-xl h-11 px-4" disabled={!newCatName.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </form>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {categories.length === 0 && <p className="text-center text-zinc-400 text-sm py-8">No categories yet. Add your first one above.</p>}
                  {categories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm font-semibold text-zinc-800">{category.name}</span>
                        <span className="text-xs text-zinc-400">({products.filter((product) => product.categoryId === category.id).length})</span>
                      </div>
                      <button onClick={() => handleDeleteCategory(category)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-300 hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {productToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setProductToDelete(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
              <div className="h-16 w-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Delete Product?</h3>
              <p className="text-zinc-500 mb-8"><strong>{productToDelete.name}</strong> will be permanently removed from your inventory.</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setProductToDelete(null)}>
                  Cancel
                </Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-12" onClick={handleDelete}>
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
