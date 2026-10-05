import { Order, OrderItem } from '../types';

/**
 * Generic Printer Module for fully local Bakery POS.
 * 
 * In a local desktop environment (like Electron), this could write to standard 
 * Serial COM ports or write files to a shared local drive.
 */

export async function printThermalSlip(order: Order, storeName: string) {
  try {
    // 1. In a web browser environment, we can generate a hidden iframe and print it.
    // 2. In an Electron environment, we can use webContents.print({ silent: true }).
    console.log('[PRINTER] Printing Thermal Slip for Order:', order.id);
    
    // For now, this is a mock console print to simulate the thermal print ticket
    let ticket = `\n--- THERMAL SLIP ---\n`;
    ticket += `${storeName}\n`;
    ticket += `Order #${order.id.slice(0, 6)}\n`;
    ticket += `--------------------\n`;
    order.items.forEach(item => {
      ticket += `${item.quantity}x ${item.name} ... ${item.price * item.quantity} MKD\n`;
    });
    ticket += `--------------------\n`;
    ticket += `TOTAL: ${order.total} MKD\n`;
    ticket += `--------------------\n`;
    
    console.log(ticket);
    return true;
  } catch (error) {
    console.error('Failed to print thermal slip:', error);
    return false;
  }
}

import { fiscalService } from '../services/fiscalService';

export async function printFiscalReceipt(
  order: Order,
  paymentMethod: 'cash' | 'card' = 'cash',
  splitDetails?: { cashAmount: number; cardAmount: number }
) {
  try {
    console.log('[PRINTER] Printing Fiscal Receipt via Bridge for Order:', order.id);
    const success = await fiscalService.printReceipt(order, paymentMethod, splitDetails);
    return success;
  } catch (error) {
    console.error('Failed to print fiscal receipt:', error);
    return false;
  }
}
