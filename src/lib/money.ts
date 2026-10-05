import { OrderItem } from '../types';

export function roundDenars(value: number): number {
  return Math.round(Number(value) || 0);
}

export function formatMKD(value: number): string {
  return `${roundDenars(value).toLocaleString()} ден`;
}

export function computeLineTotal(item: Pick<OrderItem, 'price' | 'quantity'>): number {
  return Number(item.price) * Number(item.quantity);
}

export function computeLineSubtotal(item: Pick<OrderItem, 'price' | 'quantity' | 'taxRate'>): number {
  const total = computeLineTotal(item);
  const taxRate = item.taxRate || 0;
  return total / (1 + (taxRate / 100));
}

export function computeLineTax(item: Pick<OrderItem, 'price' | 'quantity' | 'taxRate'>): number {
  const total = computeLineTotal(item);
  const subtotal = computeLineSubtotal(item);
  return total - subtotal;
}

export function computeOrderTotals(items: OrderItem[], discountType?: 'percent' | 'fixed', discountValue?: number) {
  const rawSubtotal = items.reduce((sum, item) => sum + computeLineSubtotal(item), 0);
  const rawTaxAmount = items.reduce((sum, item) => sum + computeLineTax(item), 0);
  const total = items.reduce((sum, item) => sum + computeLineTotal(item), 0);

  let subtotal = roundDenars(rawSubtotal);
  let taxAmount = roundDenars(rawTaxAmount);
  let finalTotal = roundDenars(total);

  // Recalculate tax based on rounded total and subtotal to ensure total = subtotal + taxAmount
  taxAmount = finalTotal - subtotal;

  if (discountType && discountValue) {
    let discountAmount = 0;
    if (discountType === 'percent') {
      discountAmount = finalTotal * (discountValue / 100);
    } else {
      discountAmount = discountValue;
    }
    
    // Ensure we don't discount more than the total
    discountAmount = Math.min(discountAmount, finalTotal);
    
    // Proportionally reduce subtotal and tax
    const discountRatio = finalTotal > 0 ? (finalTotal - discountAmount) / finalTotal : 1;
    
    return {
      subtotal: roundDenars(rawSubtotal * discountRatio),
      taxAmount: roundDenars(rawTaxAmount * discountRatio),
      total: roundDenars(finalTotal - discountAmount),
    };
  }

  return {
    subtotal: subtotal,
    taxAmount: taxAmount,
    total: finalTotal,
  };
}
