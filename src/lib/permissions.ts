import { Business, UserProfile, UserRole } from '../types';
import { BAKERY_CONFIG } from './businessConfig';

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
  | 'settings';

const ROLE_TABS: Record<UserRole, AppTab[]> = {
  owner: ['dashboard', 'pos', 'history', 'kitchen', 'shifts', 'inventory', 'debts', 'staff', 'reports', 'settings'],
  admin: ['dashboard', 'pos', 'history', 'kitchen', 'shifts', 'inventory', 'debts', 'staff', 'reports', 'settings'],
  manager: ['dashboard', 'pos', 'history', 'kitchen', 'shifts', 'inventory', 'debts', 'reports'],
  waiter: ['pos', 'history'],
  cashier: ['pos', 'history', 'shifts'],
  kitchen: ['kitchen'],
  super_admin: [],
};

export function getAllowedTabs(profile: UserProfile | null, business?: Business | null): AppTab[] {
  if (!profile) return [];

  const allowed = new Set(ROLE_TABS[profile.role] || []);

  if (!BAKERY_CONFIG.hasKitchenDisplay) {
    allowed.delete('kitchen');
  }

  if (profile.role === 'cashier' || profile.role === 'waiter') {
    allowed.delete('inventory');
    allowed.delete('reports');
    allowed.delete('staff');
    allowed.delete('settings');
    allowed.delete('debts');
  }

  if (profile.role === 'waiter' && BAKERY_CONFIG.hasKitchenDisplay) {
    allowed.delete('kitchen');
  }

  if (profile.role === 'cashier' && !business?.settings?.allowCustomerCredit) {
    allowed.delete('debts');
  }

  return Array.from(allowed);
}

export function getDefaultTab(profile: UserProfile | null, business?: Business | null): AppTab {
  const allowed = getAllowedTabs(profile, business);

  if (profile?.role === 'kitchen' && allowed.includes('kitchen')) return 'kitchen';
  if (profile?.role === 'cashier' && allowed.includes('pos')) return 'pos';
  if ((profile?.role === 'owner' || profile?.role === 'manager') && allowed.includes('dashboard')) return 'dashboard';
  return allowed[0] || 'pos';
}

export function isShopBlocked(business?: Business | null): boolean {
  return false; // Local builds never get blocked
}
