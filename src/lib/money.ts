import { OrderItem } from '../types';

export function roundDenars(value: number): number {
  return Math.round(Number(value) || 0);
}

export function formatMKD(value: number): string {
  return `${roundDenars(value).toLocaleString()} ден`;
}

export function computeLineSubtotal(item: Pick<OrderItem, 'price' | 'quantity'>): number {
  return roundDenars(Number(item.price) * Number(item.quantity));
}

export function computeLineTax(item: Pick<OrderItem, 'price' | 'quantity' | 'taxRate'>): number {
  return roundDenars(Number(item.price) * Number(item.quantity) * ((item.taxRate || 0) / 100));
}

export function computeOrderTotals(items: OrderItem[]) {
  const subtotal = items.reduce((sum, item) => sum + computeLineSubtotal(item), 0);
  const taxAmount = items.reduce((sum, item) => sum + computeLineTax(item), 0);
  const total = subtotal + taxAmount;

  return {
    subtotal: roundDenars(subtotal),
    taxAmount: roundDenars(taxAmount),
    total: roundDenars(total),
  };
}
