import React, { useMemo, useState } from 'react';
import { Copy, Hash, Mail, Shield, UserPlus, X, UserX, Pencil, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { generateInviteCode } from '../lib/businessData';
import { db, useLiveQuery } from '../lib/db';
import { StaffInvite, UserProfile, UserRole } from '../types';
import { BAKERY_CONFIG } from '../lib/businessConfig';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useI18n } from '../lib/i18n';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-zinc-900 text-white border-zinc-900',
  manager: 'bg-purple-50 text-purple-700 border-purple-100',
  cashier: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  kitchen: 'bg-blue-50 text-blue-700 border-blue-100',
  waiter: 'bg-zinc-100 text-zinc-700 border-zinc-100',
};

type StaffRow =
  | { type: 'active'; id: string; name: string; email: string; role: UserRole; pin?: string; status: 'active' | 'disabled' }
  | { type: 'invite'; id: string; name: string; email: string; role: StaffInvite['role']; pin?: string; status: 'invited' | 'disabled' | 'accepted'; inviteCode: string };

const normalizeRole = (role: string): UserRole | StaffInvite['role'] => (role === 'admin' ? 'manager' : role) as UserRole;

export function Staff() {
  const { profile } = useAuth();
  const { t, language } = useI18n();
  const business = useLiveQuery(() => (profile?.businessId ? db.businesses.get(profile.businessId) : undefined), [profile?.businessId]);
  const staffUsers = (useLiveQuery(() => db.users.where('businessId').equals(profile?.businessId || '').toArray()) || []) as UserProfile[];
  const invites = (useLiveQuery(() => db.staffInvites.where('businessId').equals(profile?.businessId || '').toArray()) || []) as StaffInvite[];
  const config = BAKERY_CONFIG;

  const roleOptions: { value: StaffInvite['role']; label: string; desc: string }[] = useMemo(() => [
    { value: 'manager', label: language === 'mk' ? 'Менаџер' : 'Manager', desc: language === 'mk' ? 'Оперативен надзор' : 'Operational oversight' },
    { value: 'cashier', label: language === 'mk' ? 'Касиер' : 'Cashier', desc: language === 'mk' ? 'Наплата на каса' : 'Checkout and payment flows' },
    { value: 'waiter', label: language === 'mk' ? 'Келнер / Продавач' : 'Waiter / Clerk', desc: language === 'mk' ? 'Прием на сметки и наплата' : 'Order taking and POS access' },
    { value: 'kitchen', label: language === 'mk' ? 'Кујна / Печка' : 'Kitchen Staff', desc: language === 'mk' ? 'Само преглед на нарачки' : 'Kitchen queue only' },
  ].filter((option) => config?.availableRoles.includes(option.value)), [language, config]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<StaffRow | null>(null);
  const [staffToEdit, setStaffToEdit] = useState<StaffRow | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffInvite['role']>('cashier');
  const [pin, setPin] = useState('');
  const [pinDigits, setPinDigits] = useState<4 | 6>(4);

  // Quick Change PIN Modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinStaff, setPinStaff] = useState<StaffRow | null>(null);
  const [quickPin, setQuickPin] = useState('');
  const [quickPinDigits, setQuickPinDigits] = useState<4 | 6>(4);

  const rows = useMemo<StaffRow[]>(() => {
    const activeRows: StaffRow[] = staffUsers.map((user) => ({
      type: 'active',
      id: user.uid,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      pin: user.pin,
      status: user.status === 'disabled' ? 'disabled' : 'active',
    }));

    const pendingRows: StaffRow[] = invites
      .filter((invite) => invite.status === 'invited' || invite.status === 'disabled')
      .map((invite) => ({
        type: 'invite',
        id: invite.id,
        name: invite.name,
        email: invite.email,
        role: normalizeRole(invite.role),
        pin: invite.pin,
        status: invite.status,
        inviteCode: invite.inviteCode,
      }));

    return [...activeRows, ...pendingRows];
  }, [invites, staffUsers]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setRole('cashier');
    setPin('');
    setPinDigits(4);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !name.trim()) return;

    const normalizedEmail = email.trim().toLowerCase() || `${name.toLowerCase().replace(/\s+/g, '')}@pos.internal`;

    const emailTaken = staffUsers.some((user) => user.email.toLowerCase() === normalizedEmail && user.name !== name.trim());
    if (emailTaken && email.trim()) {
      toast.error('This email is already in use by another staff member');
      return;
    }
    
    if (pin && pin.length !== pinDigits) {
      toast.error(language === 'mk' ? `ПИН-от мора да биде точно ${pinDigits} цифри` : `PIN must be exactly ${pinDigits} digits`);
      return;
    }

    setLoading(true);
    try {
      const newStaffId = `staff-${Date.now()}`;
      const newStaffProfile: UserProfile = {
        uid: newStaffId,
        name: name.trim(),
        email: normalizedEmail,
        role,
        businessId: profile.businessId,
        status: 'active',
        ...(pin ? { pin } : {}),
      };

      await db.users.add(newStaffProfile);
      toast.success(`${name.trim()} added! ${pin ? `Staff PIN: ${pin}` : ''}`);
      setIsAddOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Failed to add staff member:', error);
      toast.error(error.message || 'Failed to add staff member');
    } finally {
      setLoading(false);
    }
  };

  const handleEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffToEdit || !name.trim()) return;

    if (pin && pin.length !== pinDigits) {
      toast.error(language === 'mk' ? `ПИН-от мора да биде точно ${pinDigits} цифри` : `PIN must be exactly ${pinDigits} digits`);
      return;
    }

    setLoading(true);
    try {
      const updateData: any = {
        name: name.trim(),
        role,
      };
      
      // Update PIN or remove it if cleared
      if (pin) {
        updateData.pin = pin;
      } else {
        // Simple trick to remove PIN in firestore update is to set it to FieldValue.delete() or empty string.
        // We'll just set it to empty string for simplicity.
        updateData.pin = ''; 
      }

      if (staffToEdit.type === 'invite') {
        await db.staffInvites.update(staffToEdit.id, updateData);
      } else {
        await db.users.update(staffToEdit.id, updateData);
      }
      
      toast.success(`${name.trim()} updated successfully!`);
      setIsEditOpen(false);
      setStaffToEdit(null);
      resetForm();
    } catch (error: any) {
      console.error('Failed to update staff member:', error);
      toast.error('Failed to update staff member');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuickPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinStaff) return;

    if (quickPin && quickPin.length !== quickPinDigits) {
      toast.error(language === 'mk' ? `ПИН-от мора да биде точно ${quickPinDigits} цифри` : `PIN must be exactly ${quickPinDigits} digits`);
      return;
    }

    setLoading(true);
    try {
      const updateData: any = { pin: quickPin || '' };
      if (pinStaff.type === 'invite') {
        await db.staffInvites.update(pinStaff.id, updateData);
      } else {
        await db.users.update(pinStaff.id, updateData);
      }
      toast.success(quickPin 
        ? (language === 'mk' ? `ПИН (${quickPinDigits} цифри) зачуван за ${pinStaff.name}` : `PIN (${quickPinDigits} digits) saved for ${pinStaff.name}`)
        : (language === 'mk' ? `ПИН е отстранет за ${pinStaff.name}` : `PIN removed for ${pinStaff.name}`)
      );
      setIsPinModalOpen(false);
      setPinStaff(null);
      setQuickPin('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update PIN');
    } finally {
      setLoading(false);
    }
  };


  const handleDelete = async () => {
    if (!staffToDelete) return;
    if (staffToDelete.type === 'active' && staffToDelete.id === profile?.uid) {
      toast.error('You cannot disable yourself');
      setStaffToDelete(null);
      return;
    }

    try {
      if (staffToDelete.type === 'invite') {
        await db.staffInvites.update(staffToDelete.id, { status: 'disabled' });
      } else {
        await db.users.update(staffToDelete.id, { status: 'disabled' });
      }
      toast.success(staffToDelete.type === 'invite' ? 'Invite cancelled' : 'Staff access disabled');
      setStaffToDelete(null);
    } catch (error) {
      console.error('Failed to remove staff member:', error);
      toast.error('Failed to remove staff member');
    }
  };

  const copyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Invite code copied');
    } catch {
      toast.error(`Copy this code manually: ${code}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-zinc-900 tracking-tight">{t('staff.title')}</h2>
          <p className="text-sm font-semibold text-zinc-500 mt-1 uppercase tracking-widest">{t('staff.subtitle')}</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-2xl gap-2 h-11 px-5 transition-all font-bold" onClick={() => { resetForm(); setIsAddOpen(true); }}>
          <UserPlus className="h-5 w-5" />
          <span>{t('staff.addStaff')}</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {roleOptions.map((option) => (
          <div key={option.value} className="bg-white border border-zinc-200/60 shadow-sm rounded-3xl p-5 hover:border-zinc-300 transition-colors">
            <p className="text-4xl font-black text-zinc-900 tracking-tight">{rows.filter((row) => row.role === option.value && row.status !== 'disabled').length}</p>
            <p className="text-sm text-zinc-400 mt-1 font-bold uppercase tracking-widest">{option.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-zinc-200/60 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/80">
              <TableRow>
                <TableHead className="font-bold text-zinc-700">{language === 'mk' ? 'Име и Презиме' : 'Name'}</TableHead>
                <TableHead className="font-bold text-zinc-700">{language === 'mk' ? 'Е-пошта' : 'Email'}</TableHead>
                <TableHead className="font-bold text-zinc-700">{t('staff.role')}</TableHead>
                <TableHead className="font-bold text-zinc-700">{language === 'mk' ? 'Статус' : 'Status'}</TableHead>
                <TableHead className="font-bold text-zinc-700">{language === 'mk' ? 'Пристап' : 'Access'}</TableHead>
                <TableHead className="text-right font-bold text-zinc-700">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((member) => (
                <TableRow key={member.id} className="hover:bg-zinc-50/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-zinc-900 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-zinc-900">{member.name}</span>
                      {member.type === 'active' && member.id === profile?.uid && (
                        <Badge variant="outline" className="rounded-full text-xs font-bold">{language === 'mk' ? 'Вие' : 'You'}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-zinc-500 text-sm">
                      <Mail className="h-3.5 w-3.5" />
                      {member.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-full capitalize font-semibold text-xs ${ROLE_COLORS[member.role] || ROLE_COLORS.waiter}`}>
                      <Shield className="h-3 w-3 mr-1" />
                      {member.role === 'owner' ? (language === 'mk' ? 'Сопственик' : 'Owner') :
                       member.role === 'manager' ? (language === 'mk' ? 'Менаџер' : 'Manager') :
                       member.role === 'cashier' ? (language === 'mk' ? 'Касиер' : 'Cashier') :
                       member.role === 'kitchen' ? (language === 'mk' ? 'Кујна' : 'Kitchen') : member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-full capitalize font-bold ${member.status === 'disabled' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {member.status === 'disabled' ? (language === 'mk' ? 'Исклучен' : 'Disabled') : (language === 'mk' ? 'Активен' : 'Active')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.type === 'invite' ? (
                      <button onClick={() => copyInviteCode(member.inviteCode)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1">
                        <Copy className="h-3 w-3" /> {member.inviteCode}
                      </button>
                    ) : member.pin ? (
                      <div className="flex items-center gap-2">
                        <Hash className="h-3 w-3 text-zinc-400" />
                        <span className="text-xs text-zinc-700 font-bold bg-zinc-100 px-2 py-0.5 rounded-md">
                          {member.pin.length === 6 
                            ? (language === 'mk' ? '6-цифрен ПИН' : '6-Digit PIN')
                            : (language === 'mk' ? '4-цифрен ПИН' : '4-Digit PIN')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400 font-medium">{language === 'mk' ? 'Нема ПИН' : 'No PIN'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.status !== 'disabled' && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={language === 'mk' ? 'Промени ПИН' : 'Change PIN'}
                          className="h-8 w-8 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setPinStaff(member);
                            setQuickPin(member.pin || '');
                            setQuickPinDigits((member.pin?.length === 6 ? 6 : 4) as 4 | 6);
                            setIsPinModalOpen(true);
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={language === 'mk' ? 'Измени' : 'Edit'}
                          className="h-8 w-8 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                          onClick={() => {
                            setStaffToEdit(member);
                            setName(member.name);
                            setEmail(member.email);
                            setRole(member.role);
                            setPin(member.pin || '');
                            setPinDigits((member.pin?.length === 6 ? 6 : 4) as 4 | 6);
                            setIsEditOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setStaffToDelete(member)}
                          disabled={member.type === 'active' && member.id === profile?.uid}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-zinc-400">
                    {language === 'mk' ? 'Нема регистрирани вработени.' : 'No staff members yet. Invite your first team member.'}
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setIsAddOpen(false); resetForm(); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-[440px] bg-white rounded-3xl shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-zinc-900">{t('staff.addStaff')}</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">{language === 'mk' ? 'Брзо отклучување на касата со 4-цифрен ПИН' : 'Staff can instantly unlock the POS register using their 4-digit PIN'}</p>
                </div>
                <button onClick={() => { setIsAddOpen(false); resetForm(); }} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-500" />
                </button>
              </div>
              <form onSubmit={handleAddStaff} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{language === 'mk' ? 'Име и Презиме *' : 'Full Name *'}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={language === 'mk' ? 'пр. Марко Петровски' : 'e.g. Marko Petrovski'} className="rounded-xl border-zinc-200 h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{t('staff.role')} *</Label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as StaffInvite['role'])}
                    className="w-full h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
                  >
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-400">{roleOptions.find((option) => option.value === role)?.desc}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-zinc-700">{t('staff.pin')}</Label>
                    <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => { setPinDigits(4); setPin((p) => p.slice(0, 4)); }}
                        className={`px-2.5 py-1 rounded-md transition-all ${pinDigits === 4 ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      >
                        4 {language === 'mk' ? 'Цифри' : 'Digits'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPinDigits(6)}
                        className={`px-2.5 py-1 rounded-md transition-all ${pinDigits === 6 ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      >
                        6 {language === 'mk' ? 'Цифри' : 'Digits'}
                      </button>
                    </div>
                  </div>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={pinDigits}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, pinDigits))}
                    placeholder={pinDigits === 4 ? '••••' : '••••••'}
                    className="rounded-xl border-zinc-200 h-11 tracking-widest text-center text-xl font-mono"
                  />
                  <p className="text-[11px] text-zinc-400">
                    {language === 'mk' ? `Опционален ${pinDigits}-цифрен ПИН за брзо отклучување на касата.` : `Optional ${pinDigits}-digit PIN for fast register login.`}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{language === 'mk' ? 'Е-пошта (Опционално)' : 'Email Address (Optional)'}</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marko@shop.mk" className="rounded-xl border-zinc-200 h-11" />
                </div>
                <Button type="submit" className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white shadow-lg" disabled={loading}>
                  {loading ? t('common.saving') : (language === 'mk' ? 'Зачувај Вработен' : 'Save Staff Member')}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditOpen && staffToEdit && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setIsEditOpen(false); setStaffToEdit(null); resetForm(); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-[440px] bg-white rounded-3xl shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-zinc-900">{language === 'mk' ? 'Измени Вработен' : 'Edit Staff Member'}</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">{language === 'mk' ? 'Промена на улога или ресетирање на ПИН' : 'Update role or reset PIN'}</p>
                </div>
                <button onClick={() => { setIsEditOpen(false); setStaffToEdit(null); resetForm(); }} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-500" />
                </button>
              </div>
              <form onSubmit={handleEditStaff} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{language === 'mk' ? 'Име и Презиме *' : 'Full Name *'}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={language === 'mk' ? 'пр. Марко Петровски' : 'e.g. Marko Petrovski'} className="rounded-xl border-zinc-200 h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">{t('staff.role')} *</Label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as StaffInvite['role'])}
                    className="w-full h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
                    disabled={staffToEdit.type === 'active' && staffToEdit.id === profile?.uid}
                  >
                    {staffToEdit.type === 'active' && staffToEdit.id === profile?.uid ? (
                      <option value="owner">{language === 'mk' ? 'Сопственик (Администратор)' : 'Owner (Store Admin)'}</option>
                    ) : (
                      roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-zinc-700">{t('staff.pin')}</Label>
                    <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => { setPinDigits(4); setPin((p) => p.slice(0, 4)); }}
                        className={`px-2.5 py-1 rounded-md transition-all ${pinDigits === 4 ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      >
                        4 {language === 'mk' ? 'Цифри' : 'Digits'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPinDigits(6)}
                        className={`px-2.5 py-1 rounded-md transition-all ${pinDigits === 6 ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      >
                        6 {language === 'mk' ? 'Цифри' : 'Digits'}
                      </button>
                    </div>
                  </div>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={pinDigits}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, pinDigits))}
                    placeholder={pinDigits === 4 ? '••••' : '••••••'}
                    className="rounded-xl border-zinc-200 h-11 tracking-widest text-center text-xl font-mono"
                  />
                  <p className="text-[11px] text-zinc-500">{language === 'mk' ? `${pinDigits}-цифрен ПИН за најава на каса (оставете празно за бришење)` : `${pinDigits}-digit PIN for register login (leave blank to remove)`}</p>
                </div>
                <Button type="submit" className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white shadow-lg" disabled={loading}>
                  {loading ? t('common.saving') : t('common.save')}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Change PIN Modal */}
      <AnimatePresence>
        {isPinModalOpen && pinStaff && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => { setIsPinModalOpen(false); setPinStaff(null); setQuickPin(''); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 leading-none">
                      {language === 'mk' ? 'Промени ПИН' : 'Change PIN'}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">{pinStaff.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setIsPinModalOpen(false); setPinStaff(null); setQuickPin(''); }}
                  className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveQuickPin} className="mt-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                      {language === 'mk' ? 'Должина на ПИН' : 'PIN Length'}
                    </Label>
                    <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => { setQuickPinDigits(4); setQuickPin((p) => p.slice(0, 4)); }}
                        className={`px-2.5 py-1 rounded-md transition-all ${quickPinDigits === 4 ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      >
                        4 {language === 'mk' ? 'Цифри' : 'Digits'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickPinDigits(6)}
                        className={`px-2.5 py-1 rounded-md transition-all ${quickPinDigits === 6 ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      >
                        6 {language === 'mk' ? 'Цифри' : 'Digits'}
                      </button>
                    </div>
                  </div>

                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={quickPinDigits}
                    value={quickPin}
                    onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, '').slice(0, quickPinDigits))}
                    placeholder={quickPinDigits === 4 ? '••••' : '••••••'}
                    autoFocus
                    className="h-12 text-center text-2xl tracking-widest font-mono rounded-2xl border-zinc-200"
                  />
                  <p className="text-[11px] text-zinc-400 text-center">
                    {language === 'mk'
                      ? `Внесете нов ${quickPinDigits}-цифрен ПИН или оставете празно за отстранување.`
                      : `Enter new ${quickPinDigits}-digit PIN or leave blank to remove.`}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  {pinStaff.pin ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loading}
                      onClick={async () => {
                        setQuickPin('');
                        setLoading(true);
                        try {
                          const updateData: any = { pin: '' };
                          if (pinStaff.type === 'invite') {
                            await db.staffInvites.update(pinStaff.id, updateData);
                          } else {
                            await db.users.update(pinStaff.id, updateData);
                          }
                          toast.success(language === 'mk' ? `ПИН-от е отстранет за ${pinStaff.name}` : `PIN removed for ${pinStaff.name}`);
                          setIsPinModalOpen(false);
                          setPinStaff(null);
                          setQuickPin('');
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to remove PIN');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="rounded-2xl h-11 border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold"
                    >
                      {language === 'mk' ? 'Отстрани ПИН' : 'Remove PIN'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setIsPinModalOpen(false); setPinStaff(null); setQuickPin(''); }}
                      className="rounded-2xl h-11 text-xs font-bold"
                    >
                      {t('common.cancel')}
                    </Button>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="rounded-2xl h-11 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold shadow-md"
                  >
                    {loading ? t('common.saving') : (language === 'mk' ? 'Зачувај ПИН' : 'Save PIN')}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {staffToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setStaffToDelete(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
              <div className="h-16 w-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <UserX className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">
                {language === 'mk' ? `Деактивирање на ${staffToDelete.name}?` : `Disable access for ${staffToDelete.name}?`}
              </h3>
              <p className="text-zinc-500 mb-8">
                {language === 'mk' ? 'Ова лице ќе го изгуби пристапот до касата, но ќе остане во историјата на сметки.' : 'This person will lose access immediately but remain in transaction history.'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setStaffToDelete(null)}>{t('common.cancel')}</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-12 font-bold" onClick={handleDelete}>
                  {language === 'mk' ? 'Деактивирај' : 'Disable'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
