import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../lib/i18n';
import { db, useLiveQuery } from '../lib/db';
import { getAllowedTabs } from '../lib/permissions';
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
  Crown,
  ChevronLeft,
  ChevronRight
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
  const { t, language, setLanguage } = useI18n();
  const currentProfile = effectiveProfile || profile;

  const [business, setBusiness] = useState<Business | null>(null);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Selected staff member for PIN entry
  const [selectedStaff, setSelectedStaff] = useState<UserProfile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const staffUsers = (useLiveQuery(
    () => (profile?.businessId ? db.users.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as UserProfile[];

  // Use LiveQuery to fetch business profile
  useLiveQuery(() => {
    if (profile?.businessId) {
      db.businesses.get(profile.businessId).then(b => {
        setBusiness(b || null);
      });
    }
  }, [profile?.businessId]);

  const activeShift = useLiveQuery(async () => {
    if (!profile?.businessId) return null;
    const openShifts = await db.shifts.where('businessId').equals(profile.businessId).toArray();
    const active = openShifts
      .filter((s) => s.status === 'open')
      .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())[0];
    return active || null;
  }, [profile?.businessId]);

  const baseMenuItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, roles: ['owner', 'admin', 'manager'] },
    { id: 'pos', label: t('nav.pos'), icon: ShoppingCart, roles: ['owner', 'waiter', 'cashier', 'admin', 'manager'] },
    { id: 'history', label: t('nav.orders'), icon: History, roles: ['owner', 'waiter', 'cashier', 'admin', 'manager'] },
    { id: 'kitchen', label: t('nav.kitchen'), icon: Utensils, roles: ['owner', 'kitchen', 'admin', 'manager'], types: ['coffee', 'restaurant', 'bakery', 'pastry'] },
    { id: 'shifts', label: t('nav.shifts'), icon: TrendingUp, roles: ['owner', 'cashier', 'admin', 'manager'] },
    { id: 'inventory', label: t('nav.inventory'), icon: Package, roles: ['owner', 'admin', 'manager'] },
    { id: 'debts', label: t('nav.customers'), icon: Users, roles: ['owner', 'admin', 'manager'] },
    { id: 'staff', label: t('nav.staff'), icon: Users, roles: ['owner', 'admin'] },
    { id: 'reports', label: t('nav.reports'), icon: TrendingUp, roles: ['owner', 'admin', 'manager'] },
    { id: 'settings', label: t('nav.settings'), icon: Settings, roles: ['owner', 'admin'] },
  ];

  const isSuperAdmin = profile?.email === 'muhamedsuleyman97@gmail.com' || profile?.role === 'super_admin';
  
  const menuItems = isSuperAdmin 
    ? [...baseMenuItems, { id: 'super-admin', label: 'Super Admin / Платформа', icon: ShieldCheck, roles: ['owner', 'admin', 'super_admin'] }]
    : baseMenuItems;

  const allowedTabs = getAllowedTabs(currentProfile, business);

  const filteredMenu = menuItems.filter(item => allowedTabs.includes(item.id as any));

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
    const targetLength = selectedStaff.pin?.length || 4;
    if (enteredPin.length >= targetLength) return;

    const nextPin = enteredPin + digit;
    setEnteredPin(nextPin);
    setPinError(false);

    if (nextPin.length === targetLength) {
      if (nextPin === selectedStaff.pin) {
        if (selectedStaff.uid === profile?.uid) {
          setActiveStaff(null);
        } else {
          setActiveStaff(selectedStaff);
        }
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
    if (profile?.pin) {
      setSelectedStaff(profile);
      setEnteredPin('');
      setPinError(false);
    } else {
      setActiveStaff(null);
      setIsStaffModalOpen(false);
      setSelectedStaff(null);
      setEnteredPin('');
      toast.success(`Active operator: ${profile?.name || 'Store Owner'}`);
    }
  };

  const SidebarContent = ({ isCollapsed = false }: { isCollapsed?: boolean }) => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={cn("p-4 border-b border-zinc-100 flex items-center shrink-0 h-[88px]", isCollapsed ? "justify-center" : "gap-3")}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-2xl bg-white border border-zinc-200/80 p-1 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
              <img src="./logo.png" alt="ZEZ-POS" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-tight text-zinc-900 truncate">ZEZ-POS</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 py-0.5 border-zinc-200 text-zinc-700 bg-zinc-50 shrink-0">
                  {currentProfile?.role}
                </Badge>
                <span className="text-xs text-zinc-400 font-medium truncate">{business?.name || 'ZEZ Bakery'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-11 w-11 rounded-2xl bg-white border border-zinc-200/80 p-1 flex items-center justify-center shadow-sm overflow-hidden" title="ZEZ-POS">
            <img src="./logo.png" alt="ZEZ" className="h-full w-full object-contain" />
          </div>
        )}
      </div>
      
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              setIsMobileMenuOpen(false);
            }}
            title={isCollapsed ? item.label : undefined}
            className={cn(
              "flex items-center w-full py-3.5 text-sm font-medium rounded-2xl transition-all duration-200 group relative",
              isCollapsed ? "justify-center px-0" : "px-4",
              activeTab === item.id 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 font-bold tracking-wide" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <item.icon className={cn("h-5 w-5 transition-transform duration-200 shrink-0", !isCollapsed && "mr-3 group-hover:scale-110", activeTab === item.id ? "text-white" : "text-zinc-400")} />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-100 space-y-2 shrink-0">
        <Button 
          variant="outline"
          title={isCollapsed ? t('nav.switchUser') : undefined}
          className={cn("w-full text-xs font-semibold rounded-xl border-zinc-200 hover:bg-zinc-100", isCollapsed ? "justify-center px-0" : "justify-start")}
          onClick={() => setIsStaffModalOpen(true)}
        >
          <KeyRound className={cn("h-4 w-4 text-zinc-500 shrink-0", !isCollapsed && "mr-2")} />
          {!isCollapsed && <span>{t('nav.switchUser')}</span>}
        </Button>
        <Button 
          variant="ghost" 
          title={isCollapsed ? t('nav.logout') : undefined}
          className={cn("w-full text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-xl", isCollapsed ? "justify-center px-0" : "justify-start")}
          onClick={logout}
        >
          <LogOut className={cn("h-4 w-4 shrink-0", !isCollapsed && "mr-2")} />
          {!isCollapsed && <span>{t('nav.logout')}</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-zinc-50/50 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className={cn("hidden lg:flex bg-white border-r border-zinc-200/60 flex-col shadow-sm z-20 transition-all duration-300 relative shrink-0", isSidebarCollapsed ? "w-[88px]" : "w-[260px]")}>
        <SidebarContent isCollapsed={isSidebarCollapsed} />
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-[32px] bg-white border border-zinc-200 shadow-sm rounded-full p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors z-50 flex items-center justify-center h-6 w-6"
        >
          {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-zinc-200/60 flex items-center justify-between px-4 lg:px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-6 w-6" />
                  </Button>
                }
              />
              <SheetContent side="left" className="p-0 w-72">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <h2 className="text-lg font-bold text-zinc-900 capitalize hidden sm:block">
              {menuItems.find(i => i.id === activeTab)?.label || activeTab}
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
                {activeShift ? t('nav.shiftOpen') : t('nav.shiftClosed')}
              </Badge>
              <div className="hidden md:flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                <Printer className="h-3 w-3" />
                Fiscal Ready
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher Pill */}
            <div className="flex items-center bg-zinc-100/90 p-1 rounded-2xl border border-zinc-200/80 shadow-xs">
              <button
                type="button"
                onClick={() => setLanguage('mk')}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1",
                  language === 'mk' 
                    ? "bg-white text-zinc-900 shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-800"
                )}
                title="Македонски"
              >
                <span>🇲🇰</span>
                <span>МК</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1",
                  language === 'en' 
                    ? "bg-white text-zinc-900 shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-800"
                )}
                title="English"
              >
                <span>🇬🇧</span>
                <span>EN</span>
              </button>
            </div>

            {/* Quick Staff Switcher Button */}
            <button
              onClick={() => setIsStaffModalOpen(true)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 transition-all border border-zinc-200/80 text-left cursor-pointer group"
              title={t('nav.switchUser')}
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
                <span className="text-[10px] text-zinc-500 font-medium">{t('nav.switchUser')} ▾</span>
              </div>
            </button>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <div className="p-4 lg:p-8 min-h-full">
            {children}
          </div>
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
                    {selectedStaff ? `${selectedStaff.name}` : t('nav.selectStaff')}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {selectedStaff ? t('nav.enterPin') : t('nav.switchUser')}
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
                        {[...Array(selectedStaff.pin?.length || 4)].map((_, index) => (
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
                      <p className="text-xs text-zinc-400 font-medium">
                        {language === 'mk' ? `Внесете ПИН за ${selectedStaff.name}` : `Enter PIN for ${selectedStaff.name}`}
                      </p>
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
                      ← {t('common.back')}
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
