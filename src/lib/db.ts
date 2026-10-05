import Dexie, { Table } from 'dexie';
import { useLiveQuery as dexieUseLiveQuery } from 'dexie-react-hooks';
import { 
  UserProfile, 
  Business, 
  Table as DiningTable, 
  Product, 
  Category, 
  Order, 
  Transaction, 
  Customer, 
  CashShift, 
  StaffInvite,
  ParkedOrder
} from '../types';

export const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export class POSDatabase extends Dexie {
  users!: Table<UserProfile, string>;
  businesses!: Table<Business, string>;
  diningTables!: Table<DiningTable, string>;
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  orders!: Table<Order, string>;
  transactions!: Table<Transaction, string>;
  customers!: Table<Customer, string>;
  shifts!: Table<CashShift, string>;
  staffInvites!: Table<StaffInvite, string>;
  parkedOrders!: Table<ParkedOrder, string>;

  constructor() {
    super('BakeryPOSDatabase');
    
    this.version(1).stores({
      users: 'uid, businessId, role',
      businesses: 'id, type, ownerId',
      diningTables: 'id, businessId, status',
      products: 'id, businessId, categoryId, barcode',
      categories: 'id, businessId',
      orders: 'id, businessId, status, createdAt',
      transactions: 'id, businessId, orderId, shiftId, createdAt',
      customers: 'id, businessId, name, phone',
      shifts: 'id, businessId, status, openedAt',
      staffInvites: 'id, businessId, status'
    });

    this.version(2).stores({
      users: 'uid, businessId, role',
      businesses: 'id, type, ownerId',
      diningTables: 'id, businessId, status',
      products: 'id, businessId, categoryId, barcode',
      categories: 'id, businessId',
      orders: 'id, businessId, status, createdAt',
      transactions: 'id, businessId, orderId, shiftId, createdAt',
      customers: 'id, businessId, name, phone',
      shifts: 'id, businessId, status, openedAt',
      staffInvites: 'id, businessId, status',
      parkedOrders: 'id, businessId, createdAt'
    });
  }
}

export const dexieDb = new POSDatabase();
export const useLiveQuery = dexieUseLiveQuery;

class CollectionWrapper<T = any> {
  constructor(private table: Table<T, string>) {}

  get(id: string) {
    if (!id) return Promise.resolve(undefined);
    return this.table.get(id);
  }

  async add(data: any) {
    const id = data.id || data.uid || generateId();
    const record = { ...data, id };
    if (this.table.name === 'users') {
      record.uid = record.uid || id;
    }
    await this.table.put(record as unknown as T, id);
    return id;
  }

  async update(id: string, data: any) {
    if (!id) return;
    await this.table.update(id, data);
  }

  async delete(id: string) {
    if (!id) return;
    await this.table.delete(id);
  }

  toArray(): Promise<T[]> {
    return this.table.toArray();
  }

  async count() {
    return this.table.count();
  }

  async bulkAdd(rows: any[]) {
    const processedRows = rows.map(row => {
      const id = row.id || row.uid || generateId();
      return { ...row, id };
    });
    await this.table.bulkPut(processedRows as unknown as T[]);
  }

  async bulkPut(rows: any[]) {
    await this.bulkAdd(rows);
  }

  where(field: string) {
    return {
      equals: (val: any) => ({
        toArray: () => this.table.where(field).equals(val).toArray(),
        first: () => this.table.where(field).equals(val).first(),
        modify: (changes: any) => this.table.where(field).equals(val).modify(changes),
      }),
      anyOf: (vals: any[]) => ({
        toArray: () => this.table.where(field).anyOf(vals).toArray(),
      }),
    };
  }
}

export const db: any = {
  version: () => dexieDb.verno,
  users: new CollectionWrapper(dexieDb.users as any),
  businesses: new CollectionWrapper(dexieDb.businesses as any),
  diningTables: new CollectionWrapper(dexieDb.diningTables as any),
  products: new CollectionWrapper(dexieDb.products as any),
  categories: new CollectionWrapper(dexieDb.categories as any),
  orders: new CollectionWrapper(dexieDb.orders as any),
  transactions: new CollectionWrapper(dexieDb.transactions as any),
  customers: new CollectionWrapper(dexieDb.customers as any),
  shifts: new CollectionWrapper(dexieDb.shifts as any),
  staffInvites: new CollectionWrapper(dexieDb.staffInvites as any),
  parkedOrders: new CollectionWrapper(dexieDb.parkedOrders as any),
};
