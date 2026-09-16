import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  limit as fsLimit,
} from 'firebase/firestore';
import { firestoreDb } from './firebase';

let activeLiveQuerySetter: ((data: any) => void) | null = null;
let activeLiveQueryRegisterUnsub: ((unsub: () => void) => void) | null = null;

export function useLiveQuery<T>(querier: () => Promise<T> | T, deps: any[] = []): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    activeLiveQuerySetter = setData;
    activeLiveQueryRegisterUnsub = (registeredUnsub) => {
      unsub = registeredUnsub;
    };

    const result = querier();

    activeLiveQuerySetter = null;
    activeLiveQueryRegisterUnsub = null;

    if (result instanceof Promise) {
      result.then((value) => {
        if (!cancelled) {
          setData(value);
        }
      }).catch(console.error);
    } else if (!cancelled) {
      setData(result);
    }

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, deps);

  return data;
}

class QueryWrapper<T = any> {
  private anyOfValues: any[] | null = null;
  private equalsValue: any = null;
  private extraFilter: ((item: T) => boolean) | null = null;
  private reversed = false;
  private limitedTo = 0;
  private sortedField: string | null = null;

  constructor(private collectionName: string, private field: string) {}

  anyOf(values: any[]) {
    this.anyOfValues = values;
    return this;
  }

  and(filter: (item: T) => boolean) {
    this.extraFilter = filter;
    return this;
  }

  equals(value: any) {
    this.equalsValue = value;
    return this;
  }

  reverse() {
    this.reversed = true;
    return this;
  }

  limit(count: number) {
    this.limitedTo = count;
    return this;
  }

  sortBy(field: string) {
    this.sortedField = field;
    return this;
  }

  private buildQuery() {
    const constraints: any[] = [];
    constraints.push(this.anyOfValues ? where(this.field, 'in', this.anyOfValues) : where(this.field, '==', this.equalsValue));

    if (this.sortedField) {
      constraints.push(orderBy(this.sortedField, this.reversed ? 'desc' : 'asc'));
    } else if (this.reversed) {
      constraints.push(orderBy(this.field, 'desc'));
    }

    if (this.limitedTo) {
      constraints.push(fsLimit(this.limitedTo));
    }

    return query(collection(firestoreDb, this.collectionName), ...constraints);
  }

  toArray(): Promise<T[]> {
    const setter = activeLiveQuerySetter;
    const registerUnsub = activeLiveQueryRegisterUnsub;

    return new Promise((resolve, reject) => {
      const builtQuery = this.buildQuery();
      if (setter && registerUnsub) {
        let isFirst = true;
        const unsub = onSnapshot(
          builtQuery,
          (snapshot) => {
            let items = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as T));
            if (this.extraFilter) items = items.filter(this.extraFilter);
            if (isFirst) {
              resolve(items);
              isFirst = false;
            } else {
              setter(items);
            }
          },
          reject
        );
        registerUnsub(unsub);
        return;
      }

      getDocs(builtQuery)
        .then((snapshot) => {
          let items = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as T));
          if (this.extraFilter) items = items.filter(this.extraFilter);
          resolve(items);
        })
        .catch(reject);
    });
  }

  first(): Promise<T | undefined> {
    return this.limit(1).toArray().then((items) => items[0]);
  }

  async modify(changes: any) {
    const builtQuery = this.buildQuery();
    const snapshot = await getDocs(builtQuery);
    const batch = writeBatch(firestoreDb);
    snapshot.docs.forEach((snapshotDoc) => {
      batch.update(snapshotDoc.ref, changes);
    });
    await batch.commit();
  }
}

class CollectionWrapper<T = any> {
  constructor(private collectionName: string) {}

  get(id: string) {
    if (!id) return Promise.resolve(undefined);

    const setter = activeLiveQuerySetter;
    const registerUnsub = activeLiveQueryRegisterUnsub;
    return new Promise<T | undefined>((resolve, reject) => {
      const ref = doc(firestoreDb, this.collectionName, id);
      if (setter && registerUnsub) {
        let isFirst = true;
        const unsub = onSnapshot(
          ref,
          (snapshot) => {
            const data = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : undefined;
            if (isFirst) {
              resolve(data);
              isFirst = false;
            } else {
              setter(data);
            }
          },
          reject
        );
        registerUnsub(unsub);
        return;
      }

      getDoc(ref)
        .then((snapshot) => resolve(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : undefined))
        .catch(reject);
    });
  }

  async add(data: any) {
    const id = data.id || data.uid || crypto.randomUUID();
    const record = { ...data, id };
    if (this.collectionName === 'users') {
      record.uid = record.uid || id;
    }
    await setDoc(doc(firestoreDb, this.collectionName, id), record);
    return id;
  }

  async update(id: string, data: any) {
    if (!id) return;
    await updateDoc(doc(firestoreDb, this.collectionName, id), data);
  }

  async delete(id: string) {
    if (!id) return;
    await deleteDoc(doc(firestoreDb, this.collectionName, id));
  }

  toArray(): Promise<T[]> {
    const setter = activeLiveQuerySetter;
    const registerUnsub = activeLiveQueryRegisterUnsub;

    return new Promise((resolve, reject) => {
      const ref = collection(firestoreDb, this.collectionName);
      if (setter && registerUnsub) {
        let isFirst = true;
        const unsub = onSnapshot(
          ref,
          (snapshot) => {
            const items = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as T));
            if (isFirst) {
              resolve(items);
              isFirst = false;
            } else {
              setter(items);
            }
          },
          reject
        );
        registerUnsub(unsub);
        return;
      }

      getDocs(ref)
        .then((snapshot) => resolve(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as T))))
        .catch(reject);
    });
  }

  async count() {
    const snapshot = await getDocs(collection(firestoreDb, this.collectionName));
    return snapshot.docs.length;
  }

  async bulkAdd(rows: any[]) {
    const batch = writeBatch(firestoreDb);
    rows.forEach((row) => {
      const id = row.id || row.uid || crypto.randomUUID();
      batch.set(doc(firestoreDb, this.collectionName, id), { ...row, id });
    });
    await batch.commit();
  }

  async bulkPut(rows: any[]) {
    await this.bulkAdd(rows);
  }

  where(field: string) {
    return new QueryWrapper<T>(this.collectionName, field);
  }
}

export const db: any = {
  version: () => ({ stores: () => {} }),
  users: new CollectionWrapper('users'),
  businesses: new CollectionWrapper('businesses'),
  diningTables: new CollectionWrapper('diningTables'),
  products: new CollectionWrapper('products'),
  categories: new CollectionWrapper('categories'),
  orders: new CollectionWrapper('orders'),
  transactions: new CollectionWrapper('transactions'),
  customers: new CollectionWrapper('customers'),
  shifts: new CollectionWrapper('shifts'),
  staffInvites: new CollectionWrapper('staffInvites'),
};
