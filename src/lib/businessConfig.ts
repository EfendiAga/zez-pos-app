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

export const BUSINESS_CONFIGS: Record<BusinessType, BusinessConfig> = {
  restaurant: {
    type: 'restaurant',
    label: 'Restaurant',
    description: 'Table service with kitchen workflow and waiter support.',
    hasTables: true,
    hasKitchenDisplay: true,
    kitchenLabel: 'Kitchen',
    hasBarcodes: false,
    hasWeightBased: false,
    availableRoles: ['owner', 'manager', 'waiter', 'cashier', 'kitchen'],
    defaultCategories: ['Appetizers', 'Main Course', 'Salads', 'Desserts', 'Drinks'],
    posDefaultView: 'tables',
  },
  coffee: {
    type: 'coffee',
    label: 'Coffee Shop',
    description: 'Cafe and bar workflow with tables and preparation queue.',
    hasTables: true,
    hasKitchenDisplay: true,
    kitchenLabel: 'Bar',
    hasBarcodes: false,
    hasWeightBased: false,
    availableRoles: ['owner', 'manager', 'waiter', 'cashier', 'kitchen'],
    defaultCategories: ['Coffee', 'Tea', 'Cold Drinks', 'Pastries', 'Alcohol'],
    posDefaultView: 'tables',
  },
  market: {
    type: 'market',
    label: 'Market',
    description: 'Counter retail workflow with barcode-first selling.',
    hasTables: false,
    hasKitchenDisplay: false,
    kitchenLabel: 'Kitchen',
    hasBarcodes: true,
    hasWeightBased: false,
    availableRoles: ['owner', 'manager', 'cashier'],
    defaultCategories: ['Groceries', 'Dairy', 'Beverages', 'Snacks', 'Household'],
    posDefaultView: 'pos',
  },
  pastry_bakery: {
    type: 'pastry_bakery',
    label: 'Pastry / Bakery',
    description: 'Counter pastry and bakery workflow with optional barcode and weight-based items.',
    hasTables: false,
    hasKitchenDisplay: false,
    kitchenLabel: 'Kitchen',
    hasBarcodes: true,
    hasWeightBased: true,
    availableRoles: ['owner', 'manager', 'cashier'],
    defaultCategories: ['Pastries', 'Bread', 'Cakes', 'Cookies', 'Drinks'],
    posDefaultView: 'pos',
  },
};

export function getBusinessConfig(type: string | undefined | null): BusinessConfig | null {
  if (!type) return null;
  const normalized = (type === 'pastry' || type === 'bakery') ? 'pastry_bakery' : type;
  return BUSINESS_CONFIGS[normalized as BusinessType] || null;
}

export function businessHasKitchen(business: Business | null | undefined): boolean {
  const config = business ? getBusinessConfig(business.type) : null;
  return Boolean(config?.hasKitchenDisplay);
}

export function businessHasTables(business: Business | null | undefined): boolean {
  const config = business ? getBusinessConfig(business.type) : null;
  return Boolean(config?.hasTables);
}
