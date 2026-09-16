import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { auth, db as rawDb } from '../firebase';
import { db, useLiveQuery } from '../lib/db';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Business, CashShift, UserProfile } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { Input } from './ui/input';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Utensils, 
  Settings, 
  LogOut, 
  Package, 
  Users,
  TrendingUp,
  Printer,
  Menu,
  X,
  History,
  ShieldCheck,
  UserCheck,
  KeyRound,
  Delete,
  Crown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { profile, activeStaff, effectiveProfile, setActiveStaff, logout } = useAuth();
  const currentProfile = effectiveProfile || profile;

  const [business, setBusiness] = useState<Business | null>(null);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  
  // Selected staff member for PIN entry
  const [selectedStaff, setSelectedStaff] = useState<UserProfile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const staffUsers = (useLiveQuery(
    () => (profile?.businessId ? db.users.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as UserProfile[];

  useEffect(() => {
    if (!profile?.businessId) {
      setBusiness(null);
      setActiveShift(null);
      return;
    }

    const unsub = onSnapshot(doc(rawDb, 'businesses', profile.businessId), (snap) => {
      if (snap.exists()) setBusiness({ id: snap.id, ...snap.data() } as Business);
    });

    const unsubShift = onSnapshot(
      query(collection(rawDb, `businesses/${profile.businessId}/cashShifts`), where('status', '==', 'open'), limit(1)),
      (snap) => {
        setActiveShift(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as CashShift));
      }
    );

    return () => {
      unsub();
      unsubShift();
    };
  }, [profile?.businessId]);

  const baseMenuItems = [
    { id: 'dashboard', label: 'Dashboard / Преглед', icon: LayoutDashboard, roles: ['owner', 'admin', 'manager'] },
    { id: 'pos', label: 'Point of Sale / Каса', icon: ShoppingCart, roles: ['owner', 'waiter', 'cashier', 'admin', 'manager'] },
    { id: 'history', label: 'Order History / Историја', icon: History, roles: ['owner', 'waiter', 'cashier', 'admin', 'manager'] },
    { id: 'kitchen', label: 'Kitchen / Кујна', icon: Utensils, roles: ['owner', 'kitchen', 'admin', 'manager'], types: ['coffee', 'restaurant', 'bakery', 'pastry'] },
    { id: 'shifts', label: 'Shifts / Смени', icon: TrendingUp, roles: ['owner', 'cashier', 'admin', 'manager'] },
    { id: 'inventory', label: 'Inventory / Залиха', icon: Package, roles: ['owner', 'admin', 'manager'] },
    { id: 'debts', label: 'Veresija / Долгови', icon: Users, roles: ['owner', 'admin', 'manager'] },
    { id: 'staff', label: 'Staff / Персонал', icon: Users, roles: ['owner', 'admin'] },
    { id: 'reports', label: 'Reports / Извештаи', icon: TrendingUp, roles: ['owner', 'admin', 'manager'] },
    { id: 'settings', label: 'Settings / Подесувања', icon: Settings, roles: ['owner', 'admin'] },
  ];

  const isSuperAdmin = profile?.email === 'muhamedsuleyman97@gmail.com' || profile?.role === 'super_admin';
  
  const menuItems = isSuperAdmin 
    ? [...baseMenuItems, { id: 'super-admin', label: 'Super Admin / Платформа', icon: ShieldCheck, roles: ['owner', 'admin', 'super_admin'] }]
    : baseMenuItems;

  const filteredMenu = menuItems.filter(item => {
    const roleMatch = item.roles.includes(currentProfile?.role || '');
    const typeMatch = !item.types || (business && item.types.includes(business.type));
    return roleMatch && typeMatch;
  });

  const handleSelectStaffMember = (staff: UserProfile) => {
    if (!staff.pin) {
      setActiveStaff(staff);
      setIsStaffModalOpen(false);
      setSelectedStaff(null);
      setEnteredPin('');
      toast.success(`Switched operator to ${staff.name} (${staff.role})`);
    } else {
      setSelectedStaff(staff);
      setEnteredPin('');
      setPinError(false);
    }
  };

  const handlePinDigit = (digit: string) => {
    if (!selectedStaff) return;
    if (enteredPin.length >= 4) return;

    const nextPin = enteredPin + digit;
    setEnteredPin(nextPin);
    setPinError(false);

    if (nextPin.length === 4) {
      if (nextPin === selectedStaff.pin) {
        setActiveStaff(selectedStaff);
        setIsStaffModalOpen(false);
        setSelectedStaff(null);
        setEnteredPin('');
        toast.success(`Unlocked as ${selectedStaff.name} (${selectedStaff.role})`);
      } else {
        setPinError(true);
        toast.error('Incorrect PIN');
        setTimeout(() => setEnteredPin(''), 600);
      }
    }
  };

  const handleSwitchToOwner = () => {
    setActiveStaff(null);
    setIsStaffModalOpen(false);
    setSelectedStaff(null);
    setEnteredPin('');
    toast.success(`Active operator: ${profile?.name || 'Store Owner'}`);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-zinc-100">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">easyPOS MK</h1>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-[10px] uppercase font-bold px-2 py-0.5 border-zinc-200 text-zinc-700 bg-zinc-50">
            {currentProfile?.role}
          </Badge>
          <span className="text-xs text-zinc-400 font-medium truncate">{business?.name || 'POS'}</span>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              setIsMobileMenuOpen(false);
            }}
            className={cn(
              "flex items-center w-full px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200",
              activeTab === item.id 
                ? "bg-zinc-900 text-white shadow-md font-semibold" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <item.icon className={cn("mr-3 h-5 w-5", activeTab === item.id ? "text-white" : "text-zinc-400")} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-100 space-y-2">
        <Button 
          variant="outline"
          className="w-full justify-start text-xs font-semibold rounded-xl border-zinc-200 hover:bg-zinc-100"
          onClick={() => setIsStaffModalOpen(true)}
        >
          <KeyRound className="mr-2 h-4 w-4 text-zinc-500" />
          Switch Staff / PIN
        </Button>
        <Button 
          variant="ghost" 
          className="w-full justify-start text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
          onClick={logout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out Store
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-zinc-200 flex-col">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger render={
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-6 w-6" />
                </Button>
              } />
              <SheetContent side="left" className="p-0 w-72">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <h2 className="text-lg font-bold text-zinc-900 capitalize hidden sm:block">
              {activeTab.replace('-', ' ')}
            </h2>
            <div className="hidden sm:block h-4 w-[1px] bg-zinc-200" />
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full text-[10px] uppercase font-bold px-2.5 py-0.5",
                  activeShift
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200"
                )}
              >
                {activeShift ? 'Shift Open' : 'Shift Closed'}
              </Badge>
              <div className="hidden md:flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                <Printer className="h-3 w-3" />
                Fiscal Ready
              </div>
            </div>
          </div>

          {/* Quick Staff Switcher Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsStaffModalOpen(true)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 transition-all border border-zinc-200/80 text-left cursor-pointer group"
              title="Click to switch staff operator"
            >
              <div className="h-8 w-8 rounded-xl bg-zinc-900 group-hover:bg-zinc-800 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {currentProfile?.name?.charAt(0) || 'U'}
              </div>
              <div className="hidden sm:block">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-zinc-900 leading-none">{currentProfile?.name}</span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-3.5 capitalize border-zinc-300 font-semibold text-zinc-600 bg-white">
                    {currentProfile?.role}
                  </Badge>
                </div>
                <span className="text-[10px] text-zinc-500 font-medium">Switch PIN ▾</span>
              </div>
            </button>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </div>
      </main>

      {/* Staff PIN Switcher Modal */}
      <AnimatePresence>
        {isStaffModalOpen && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setIsStaffModalOpen(false);
                setSelectedStaff(null);
                setEnteredPin('');
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-zinc-900">
                    {selectedStaff ? `Unlock ${selectedStaff.name}` : 'Switch Staff Operator'}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {selectedStaff ? 'Enter 4-digit staff PIN' : 'Select an operator or cashier for this shift'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsStaffModalOpen(false);
                    setSelectedStaff(null);
                    setEnteredPin('');
                  }}
                  className="p-2 rounded-xl hover:bg-zinc-100"
                >
                  <X className="h-5 w-5 text-zinc-500" />
                </button>
              </div>

              <div className="p-6">
                {!selectedStaff ? (
                  <div className="space-y-4">
                    {/* Owner Option */}
                    <div className="p-1">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Store Account</p>
                      <button
                        onClick={handleSwitchToOwner}
                        className={cn(
                          "w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left",
                          !activeStaff
                            ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                            : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-900"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Crown className={cn("h-5 w-5", !activeStaff ? "text-amber-400" : "text-zinc-600")} />
                          <div>
                            <p className="font-bold text-sm">{profile?.name || 'Store Owner'}</p>
                            <p className={cn("text-xs", !activeStaff ? "text-zinc-400" : "text-zinc-500")}>Full Store Admin</p>
                          </div>
                        </div>
                        {!activeStaff && (
                          <Badge className="bg-white/20 text-white border-0 text-[10px]">Active</Badge>
                        )}
                      </button>
                    </div>

                    {/* Staff List */}
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Staff Members</p>
                      {staffUsers.filter(u => u.uid !== profile?.uid && u.status !== 'disabled').length === 0 ? (
                        <div className="text-center py-6 border border-dashed border-zinc-200 rounded-2xl">
                          <p className="text-xs text-zinc-500">No staff members added yet.</p>
                          <p className="text-[11px] text-zinc-400 mt-1">Add cashiers or waiters in the Staff tab.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {staffUsers.filter(u => u.uid !== profile?.uid && u.status !== 'disabled').map(staff => {
                            const isCurrent = activeStaff?.uid === staff.uid;
                            return (
                              <button
                                key={staff.uid}
                                onClick={() => handleSelectStaffMember(staff)}
                                className={cn(
                                  "w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left",
                                  isCurrent
                                    ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                                    : "border-zinc-200 hover:bg-zinc-50 text-zinc-900"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs",
                                    isCurrent ? "bg-white text-zinc-900" : "bg-zinc-100 text-zinc-800"
                                  )}>
                                    {staff.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm">{staff.name}</p>
                                    <p className={cn("text-xs capitalize", isCurrent ? "text-zinc-300" : "text-zinc-500")}>
                                      {staff.role} {staff.pin ? '• PIN Protected' : ''}
                                    </p>
                                  </div>
                                </div>
                                {isCurrent ? (
                                  <Badge className="bg-white/20 text-white border-0 text-[10px]">Active</Badge>
                                ) : staff.pin ? (
                                  <KeyRound className="h-4 w-4 text-zinc-400" />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 4-Digit Numeric PIN Pad */
                  <div className="space-y-5">
                    <div className="text-center">
                      <div className="flex justify-center gap-3 mb-2">
                        {[0, 1, 2, 3].map(index => (
                          <div
                            key={index}
                            className={cn(
                              "h-4 w-4 rounded-full border-2 transition-all",
                              pinError
                                ? "border-red-500 bg-red-500"
                                : index < enteredPin.length
                                ? "border-zinc-900 bg-zinc-900 scale-110"
                                : "border-zinc-300 bg-transparent"
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-zinc-400">Enter PIN for {selectedStaff.name}</p>
                    </div>

                    {/* Numeric Keypad */}
                    <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                        <button
                          key={digit}
                          onClick={() => handlePinDigit(digit)}
                          className="h-14 rounded-2xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-xl font-bold text-zinc-900 transition-all flex items-center justify-center"
                        >
                          {digit}
                        </button>
                      ))}
                      <button
                        onClick={() => setEnteredPin('')}
                        className="h-14 rounded-2xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-xs font-bold text-zinc-500 transition-all flex items-center justify-center"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => handlePinDigit('0')}
                        className="h-14 rounded-2xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-xl font-bold text-zinc-900 transition-all flex items-center justify-center"
                      >
                        0
                      </button>
                      <button
                        onClick={() => setEnteredPin(enteredPin.slice(0, -1))}
                        className="h-14 rounded-2xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-zinc-700 transition-all flex items-center justify-center"
                      >
                        <Delete className="h-5 w-5" />
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedStaff(null);
                        setEnteredPin('');
                      }}
                      className="w-full text-xs text-zinc-500 hover:text-zinc-800 text-center py-2"
                    >
                      ← Back to staff list
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
