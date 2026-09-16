import { Business, BusinessType, UserProfile, UserRole } from '../types';
import { BUSINESS_CONFIGS, BusinessConfig, getBusinessConfig } from './businessConfig';

export type AppTab =
  | 'dashboard'
  | 'pos'
  | 'history'
  | 'kitchen'
  | 'shifts'
  | 'inventory'
  | 'debts'
  | 'staff'
  | 'reports'
  | 'settings'
  | 'super-admin';

const ROLE_TABS: Record<UserRole, AppTab[]> = {
  owner: ['dashboard', 'pos', 'history', 'kitchen', 'shifts', 'inventory', 'debts', 'staff', 'reports', 'settings'],
  admin: ['dashboard', 'pos', 'history', 'kitchen', 'shifts', 'inventory', 'debts', 'staff', 'reports', 'settings'],
  manager: ['dashboard', 'pos', 'history', 'kitchen', 'shifts', 'inventory', 'debts', 'reports'],
  waiter: ['pos', 'history'],
  cashier: ['pos', 'history', 'shifts'],
  kitchen: ['kitchen'],
  super_admin: ['dashboard', 'pos', 'history', 'kitchen', 'shifts', 'inventory', 'debts', 'staff', 'reports', 'settings', 'super-admin'],
};

const BUSINESS_TAB_RULES: Record<BusinessType, { remove?: AppTab[]; add?: AppTab[] }> = {
  restaurant: {},
  coffee: {},
  market: { remove: ['kitchen'] },
  pastry_bakery: { remove: ['kitchen', 'debts'] },
};

export function normalizeBusinessType(type: string | undefined | null): BusinessType | null {
  if (!type) return null;
  if (type === 'bakery' || type === 'pastry') return 'pastry_bakery';
  if (type in BUSINESS_CONFIGS) return type as BusinessType;
  return null;
}

export function resolveBusinessConfig(business?: Business | null): BusinessConfig | null {
  const type = normalizeBusinessType(business?.type);
  const base = type ? getBusinessConfig(type) : null;
  if (!base) return null;

  return {
    ...base,
    hasTables: base.hasTables && Boolean(business?.settings?.hasTables ?? base.hasTables),
    hasBarcodes: base.hasBarcodes && Boolean(business?.settings?.useBarcodes ?? base.hasBarcodes),
  };
}

export function canAccessSuperAdmin(profile: UserProfile | null): boolean {
  return profile?.email?.toLowerCase() === 'muhamedsuleyman97@gmail.com' || profile?.role === 'super_admin';
}

export function getAllowedTabs(profile: UserProfile | null, business?: Business | null): AppTab[] {
  if (!profile) return [];

  const allowed = new Set(ROLE_TABS[profile.role] || []);
  const normalizedType = normalizeBusinessType(business?.type);
  const config = resolveBusinessConfig(business);

  if (normalizedType) {
    for (const tab of BUSINESS_TAB_RULES[normalizedType].remove || []) {
      allowed.delete(tab);
    }
    for (const tab of BUSINESS_TAB_RULES[normalizedType].add || []) {
      allowed.add(tab);
    }
  }

  if (!config?.hasKitchenDisplay) {
    allowed.delete('kitchen');
  }

  if (!config?.hasTables && profile.role === 'waiter') {
    allowed.delete('dashboard');
  }

  if (profile.role === 'cashier' || profile.role === 'waiter') {
    allowed.delete('inventory');
    allowed.delete('reports');
    allowed.delete('staff');
    allowed.delete('settings');
    allowed.delete('debts');
  }

  if (profile.role === 'waiter' && config?.hasKitchenDisplay) {
    allowed.delete('kitchen');
  }

  if (profile.role === 'cashier' && !business?.settings?.allowCustomerCredit) {
    allowed.delete('debts');
  }

  if (!canAccessSuperAdmin(profile)) {
    allowed.delete('super-admin');
  }

  return Array.from(allowed);
}

export function getDefaultTab(profile: UserProfile | null, business?: Business | null): AppTab {
  const allowed = getAllowedTabs(profile, business);
  const config = resolveBusinessConfig(business);

  if (canAccessSuperAdmin(profile) && allowed.includes('super-admin')) return 'super-admin';
  if (profile?.role === 'kitchen' && allowed.includes('kitchen')) return 'kitchen';
  if (profile?.role === 'waiter' && allowed.includes('pos')) return 'pos';
  if (profile?.role === 'cashier' && allowed.includes('pos')) return 'pos';
  if ((profile?.role === 'owner' || profile?.role === 'manager') && allowed.includes('dashboard')) return 'dashboard';
  if (config?.posDefaultView === 'tables' && allowed.includes('pos')) return 'pos';
  return allowed[0] || 'dashboard';
}

export function isShopBlocked(business?: Business | null): boolean {
  return business?.accessStatus === 'blocked';
}
