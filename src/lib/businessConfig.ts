import { Business, BusinessType } from '../types';

export interface BusinessConfig {
  type: BusinessType;
  label: string;
  description: string;
  hasTables: boolean;
  hasKitchenDisplay: boolean;
  kitchenLabel: string;
  hasBarcodes: boolean;
  hasWeightBased: boolean;
  availableRoles: string[];
  defaultCategories: string[];
  posDefaultView: 'tables' | 'pos';
}

export const BAKERY_CONFIG: BusinessConfig = {
  type: 'pastry_bakery' as any,
  label: 'Bakery',
  description: 'Counter pastry and bakery workflow with optional barcode and weight-based items.',
  hasTables: false,
  hasKitchenDisplay: true,
  kitchenLabel: 'Kitchen',
  hasBarcodes: true,
  hasWeightBased: true,
  availableRoles: ['owner', 'manager', 'cashier', 'kitchen'],
  defaultCategories: ['Bread', 'Burek', 'Sweet Pastries', 'Yogurt', 'Drinks'],
  posDefaultView: 'pos',
};

export function getBusinessConfig(type?: string | null): BusinessConfig | null {
  // We strictly enforce Bakery configuration for this local build
  return BAKERY_CONFIG;
}

export function businessHasKitchen(business?: Business | null): boolean {
  return BAKERY_CONFIG.hasKitchenDisplay;
}

export function businessHasTables(business?: Business | null): boolean {
  return BAKERY_CONFIG.hasTables;
}
