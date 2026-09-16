export type UserRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'admin' | 'super_admin';
export type BusinessAccessStatus = 'pending' | 'approved' | 'blocked';
export type ShiftStatus = 'open' | 'closed';
export type TransactionType = 'sale' | 'debt_payment' | 'drawer_adjustment';
export type BusinessType = 'market' | 'coffee' | 'pastry_bakery' | 'restaurant';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  businessId: string;
  status?: 'active' | 'pending' | 'disabled';
  pin?: string;
}

export interface StaffInvite {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin?: string;
  status: 'invited' | 'accepted' | 'disabled';
  inviteCode: string;
  businessId: string;
  createdAt?: string;
  acceptedAt?: string;
  acceptedByUid?: string;
}

export interface Table {
  id: string;
  number: string;
  status: 'available' | 'occupied' | 'reserved';
  currentOrderId?: string;
}

export interface Business {
  id: string;
  name: string;
  type: 'market' | 'coffee' | 'pastry' | 'bakery' | 'restaurant' | 'pastry_bakery';
  accessStatus?: BusinessAccessStatus;
  taxRate: number;
  currency: string;
  ownerId: string;
  parentId?: string; // For hierarchy (Underclients)
  subscription?: {
    plan: 'free' | 'starter' | 'pro' | 'enterprise';
    status: 'active' | 'trial' | 'expired' | 'past_due';
    expiryDate: any;
    autoRenew: boolean;
  };
  settings?: {
    hasTables?: boolean;
    useBarcodes?: boolean;
    allowCustomerCredit?: boolean;
  };
  createdAt: any;
  lastActive?: any;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  stockQuantity: number;
  unit: 'piece' | 'kg' | 'liter';
  taxRate: number;
  taxGroup: 'A' | 'B' | 'V' | 'G';
  barcode?: string; // For Markets
  modifiers?: string[]; // For Coffee/Restaurants (e.g., "Extra Sugar", "Cold Milk")
  isWeightBased?: boolean; // For Bakeries/Pastries
  isActive?: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  taxRate: number;
  taxGroup: 'A' | 'B' | 'V' | 'G';
  notes?: string; // Kitchen notes
  selectedModifiers?: string[];
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'paid' | 'cancelled';

export interface Order {
  id: string;
  tableNumber?: string;
  items: OrderItem[];
  total: number;
  subtotal?: number;
  taxAmount?: number;
  status: OrderStatus;
  kitchenStatus?: string;
  discount?: number;
  discountType?: 'percent' | 'fixed';
  discountPercent?: number;
  businessId: string;
  createdBy: string;
  createdAt: any;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  debt: number;
  totalSpent: number;
  createdAt: any;
}

export interface Transaction {
  id: string;
  orderId?: string;
  amount: number;
  netAmount?: number;
  paymentMethod: 'cash' | 'card' | 'debt';
  taxAmount: number;
  businessId: string;
  customerId?: string; // If it's a debt
  createdBy?: string;
  createdByName?: string;
  shiftId?: string | null;
  type?: TransactionType;
  isSplit?: boolean;
  isRefund?: boolean;
  createdAt: any;
}

export interface CashShift {
  id: string;
  businessId: string;
  openedBy: string;
  openedByName?: string;
  openedAt: any;
  openingCash: number;
  status: ShiftStatus;
  expectedCash?: number;
  declaredCash?: number;
  variance?: number;
  closedAt?: any;
  closedBy?: string;
}

export type Shift = CashShift;
