import React, { useState } from 'react';
import { Pencil, Phone, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { db, useLiveQuery } from '../lib/db';
import { formatMKD, roundDenars } from '../lib/money';
import { Customer } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useI18n } from '../lib/i18n';

export function Customers() {
  const { profile } = useAuth();
  const { t, language } = useI18n();
  const customers = (useLiveQuery(
    () => (profile?.businessId ? db.customers.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Customer[];
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId) return;

    try {
      if (editingCustomer) {
        await db.customers.update(editingCustomer.id, { ...newCustomer });
        toast.success(t('common.saveSuccess'));
      } else {
        await db.customers.add({
          id: `cust-${Date.now()}`,
          businessId: profile.businessId,
          ...newCustomer,
          totalSpent: 0,
          debt: 0,
          createdAt: new Date().toISOString(),
        });
        toast.success(language === 'mk' ? 'Клиентот е успешно додаден' : 'Customer added successfully');
      }
      setIsAddOpen(false);
      setEditingCustomer(null);
      setNewCustomer({ name: '', phone: '', email: '' });
    } catch (error) {
      console.error('Failed to save customer:', error);
      toast.error(t('common.error'));
    }
  };

  const handlePayDebt = async (customer: Customer, amount: number) => {
    if (!profile?.businessId) return;
    try {
      const openShifts = await db.shifts.where('businessId').equals(profile.businessId).toArray();
      const activeShift = openShifts
        .filter((s) => s.status === 'open')
        .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())[0];

      await db.customers.update(customer.id, {
        debt: Math.max(0, roundDenars((customer.debt || 0) - amount)),
      });

      await db.transactions.add({
        id: `txn-debtpay-${Date.now()}`,
        orderId: `debtpay-${Date.now()}`,
        amount: roundDenars(amount),
        paymentMethod: 'cash',
        taxAmount: 0,
        businessId: profile.businessId,
        customerId: customer.id,
        createdBy: profile.uid,
        createdByName: profile.name,
        shiftId: activeShift?.id || null,
        type: 'debt_payment',
        createdAt: new Date().toISOString(),
      });

      toast.success('Payment recorded');
    } catch (error) {
      console.error('Failed to record payment:', error);
      toast.error('Failed to record payment');
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setNewCustomer({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
    });
    setIsAddOpen(true);
  };

  const handleDelete = async () => {
    if (!customerToDelete || !profile?.businessId) return;
    try {
      await db.customers.delete(customerToDelete.id);
      toast.success('Customer deleted');
      setCustomerToDelete(null);
    } catch (error) {
      console.error('Failed to delete customer:', error);
      toast.error('Failed to delete customer');
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const query = searchQuery.toLowerCase();
    return customer.name.toLowerCase().includes(query) || customer.phone.includes(searchQuery);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('customers.title')}</h2>
          <p className="text-zinc-500">{t('customers.subtitle')}</p>
        </div>
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open);
            if (!open) {
              setEditingCustomer(null);
              setNewCustomer({ name: '', phone: '', email: '' });
            }
          }}
        >
          <DialogTrigger
            render={
              <Button className="bg-zinc-900 rounded-xl w-full sm:w-auto">
                <UserPlus className="mr-2 h-4 w-4" /> {t('customers.addCustomer')}
              </Button>
            }
          />
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? t('customers.editCustomer') : t('customers.addCustomer')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{language === 'mk' ? 'Име или Прекар' : 'Name or Nickname'}</Label>
                <Input required value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder={language === 'mk' ? 'пр. Перо, Комшија, Семејно Име' : 'e.g. Pero, Neighbor, Family Name'} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'mk' ? 'Телефонски Број' : 'Phone Number'}</Label>
                <Input required value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="070 123 456" />
              </div>
              <div className="space-y-2">
                <Label>{language === 'mk' ? 'Е-пошта (опционално)' : 'Email (optional)'}</Label>
                <Input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder={language === 'mk' ? 'Опционално' : 'Optional'} />
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" className="bg-zinc-900 w-full rounded-xl h-12">
                  {editingCustomer ? t('common.save') : t('customers.addCustomer')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input placeholder={language === 'mk' ? 'Пребарај по име или телефон...' : 'Search by name or phone...'} className="pl-10 rounded-xl border-zinc-200 h-12" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      <Card className="border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/50">
              <TableRow>
                <TableHead className="pl-6">{language === 'mk' ? 'Клиент' : 'Customer'}</TableHead>
                <TableHead>{language === 'mk' ? 'Контакт' : 'Contact'}</TableHead>
                <TableHead>{t('customers.balance')}</TableHead>
                <TableHead>{t('customers.totalSpent')}</TableHead>
                <TableHead className="text-right pr-6">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-zinc-50/50 transition-colors">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900 font-bold">
                        {customer.name.charAt(0)}
                      </div>
                      <span className="font-semibold">{customer.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center text-sm text-zinc-600">
                        <Phone className="h-3 w-3 mr-2" /> {customer.phone}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.debt > 0 ? 'destructive' : 'outline'} className="rounded-full flex items-center w-fit gap-1 font-bold">
                      {formatMKD(customer.debt || 0)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{formatMKD(customer.totalSpent || 0)}</TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex justify-end gap-2">
                      {customer.debt > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-zinc-200 font-bold text-xs"
                          onClick={() => {
                            const amount = prompt(t('customers.settleAmount'));
                            if (amount) handlePayDebt(customer, Number.parseFloat(amount));
                          }}
                        >
                          {t('customers.settleDebt')}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handleEdit(customer)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-600 hover:bg-red-50" onClick={() => setCustomerToDelete(customer)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center text-zinc-400">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>{language === 'mk' ? 'Нема пронајдено клиенти' : 'No customers found'}</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {customerToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <CardContent className="p-8 text-center">
              <div className="h-16 w-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">
                {language === 'mk' ? `Бришење на ${customerToDelete.name}?` : `Delete ${customerToDelete.name}?`}
              </h3>
              <p className="text-zinc-500 mb-8">
                {language === 'mk' ? 'Ова трајно ќе го отстрани профилот на клиентот.' : 'This will permanently remove the customer profile.'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setCustomerToDelete(null)}>
                  {t('common.cancel')}
                </Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-12 font-bold" onClick={handleDelete}>
                  {t('common.delete')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
