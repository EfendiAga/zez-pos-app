import React, { useMemo, useState } from 'react';
import { Copy, Hash, Mail, Shield, UserPlus, X, UserX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { generateInviteCode } from '../lib/businessData';
import { db, useLiveQuery } from '../lib/db';
import { StaffInvite, UserProfile, UserRole } from '../types';
import { resolveBusinessConfig } from '../lib/permissions';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const ROLE_OPTIONS: { value: StaffInvite['role']; label: string; desc: string }[] = [
  { value: 'manager', label: 'Manager', desc: 'Operational oversight without platform access' },
  { value: 'cashier', label: 'Cashier', desc: 'Checkout and payment flows only' },
  { value: 'waiter', label: 'Waiter', desc: 'Order taking and POS access' },
  { value: 'kitchen', label: 'Kitchen Staff', desc: 'Kitchen queue only' },
];

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
  const business = useLiveQuery(() => (profile?.businessId ? db.businesses.get(profile.businessId) : undefined), [profile?.businessId]);
  const staffUsers = (useLiveQuery(() => db.users.where('businessId').equals(profile?.businessId || '').toArray()) || []) as UserProfile[];
  const invites = (useLiveQuery(() => db.staffInvites.where('businessId').equals(profile?.businessId || '').toArray()) || []) as StaffInvite[];
  const config = resolveBusinessConfig(business || null);
  const roleOptions = ROLE_OPTIONS.filter((option) => config?.availableRoles.includes(option.value));

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<StaffRow | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffInvite['role']>('cashier');
  const [pin, setPin] = useState('');

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
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Staff</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{rows.length} team records</p>
        </div>
        <Button className="bg-zinc-900 hover:bg-zinc-800 rounded-xl gap-2" onClick={() => { resetForm(); setIsAddOpen(true); }}>
          <UserPlus className="h-4 w-4" /> Add Staff Member
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {ROLE_OPTIONS.map((option) => (
          <div key={option.value} className="bg-white border border-zinc-100 rounded-2xl p-4">
            <p className="text-2xl font-black text-zinc-900">{rows.filter((row) => row.role === option.value && row.status !== 'disabled').length}</p>
            <p className="text-sm text-zinc-500 mt-0.5 font-medium">{option.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-zinc-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/80 hover:bg-zinc-50">
                <TableHead className="font-bold text-zinc-700">Name</TableHead>
                <TableHead className="font-bold text-zinc-700">Email</TableHead>
                <TableHead className="font-bold text-zinc-700">Role</TableHead>
                <TableHead className="font-bold text-zinc-700">Status</TableHead>
                <TableHead className="font-bold text-zinc-700">Access</TableHead>
                <TableHead className="text-right font-bold text-zinc-700">Actions</TableHead>
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
                        <Badge variant="outline" className="rounded-full text-xs">You</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-zinc-500">
                      <Mail className="h-3.5 w-3.5" />
                      {member.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-full capitalize font-semibold text-xs ${ROLE_COLORS[member.role] || ROLE_COLORS.waiter}`}>
                      <Shield className="h-3 w-3 mr-1" />
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-full capitalize ${member.status === 'disabled' ? 'bg-red-50 text-red-700 border-red-200' : ''}`}>
                      {member.status}
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
                        <span className="text-xs text-zinc-500">PIN set</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">Email login</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.status !== 'disabled' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setStaffToDelete(member)}
                        disabled={member.type === 'active' && member.id === profile?.uid}
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-zinc-400">
                    No staff members yet. Invite your first team member.
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
                  <h2 className="text-xl font-black text-zinc-900">Add Staff Member</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">Staff can instantly unlock the POS register using their 4-digit PIN</p>
                </div>
                <button onClick={() => { setIsAddOpen(false); resetForm(); }} className="p-2 rounded-xl hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-500" />
                </button>
              </div>
              <form onSubmit={handleAddStaff} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Full Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Marko Petrovski" className="rounded-xl border-zinc-200 h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Role *</Label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as StaffInvite['role'])}
                    className="w-full h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
                  <Label className="text-sm font-semibold text-zinc-700">4-digit PIN (Recommended for Register)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="rounded-xl border-zinc-200 h-11 tracking-widest text-center text-xl"
                  />
                  <p className="text-[11px] text-zinc-400">Used by the cashier or waiter to switch shifts in 2 seconds.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Email Address (Optional)</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marko@shop.mk (optional)" className="rounded-xl border-zinc-200 h-11" />
                </div>
                <Button type="submit" className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white shadow-lg" disabled={loading}>
                  {loading ? 'Adding Staff...' : 'Save Staff Member'}
                </Button>
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
              <h3 className="text-xl font-bold text-zinc-900 mb-2">{staffToDelete.type === 'invite' ? 'Cancel invite' : 'Disable access'} for {staffToDelete.name}?</h3>
              <p className="text-zinc-500 mb-8">{staffToDelete.type === 'invite' ? 'This invite code will stop working immediately.' : 'This person will lose access immediately but remain in history.'}</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setStaffToDelete(null)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-12" onClick={handleDelete}>{staffToDelete.type === 'invite' ? 'Cancel Invite' : 'Disable'}</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
