import { Order, Transaction, OrderItem } from '../types';

/**
 * Macedonian Fiscal Tax Groups (Standard mapping)
 * A - 18% (General)
 * B - 5% (Preferential)
 * V - 0% (Exempt)
 * G - 10% (Specific)
 */
export type FiscalTaxGroup = 'A' | 'B' | 'V' | 'G';

export interface FiscalReceiptData {
  items: {
    name: string;
    price: number;
    quantity: number;
    taxGroup: FiscalTaxGroup;
  }[];
  payment: {
    amount: number;
    method: 'CASH' | 'CARD';
  };
  total: number;
  taxTotal: number;
  timestamp: string;
}

/**
 * Service to handle communication with Macedonian Fiscal Printers.
 * In a production environment, this would typically send requests to a local 
 * fiscal driver (e.g., via HTTP to localhost:xxxx) or use WebSerial.
 */
export const fiscalService = {
  /**
   * Maps a numerical tax rate to a Macedonian fiscal tax group.
   */
  getTaxGroup(rate: number): FiscalTaxGroup {
    if (rate >= 18) return 'A';
    if (rate >= 5 && rate < 10) return 'B';
    if (rate >= 10 && rate < 18) return 'G';
    return 'V';
  },

  /**
   * Generates the data structure required for a Macedonian fiscal receipt.
   */
  generateReceiptData(order: Order, transaction: Transaction): FiscalReceiptData {
    return {
      items: order.items.map(item => ({
        name: item.name.substring(0, 20), // Most fiscal printers have char limits
        price: item.price,
        quantity: item.quantity,
        taxGroup: this.getTaxGroup(item.taxRate)
      })),
      payment: {
        amount: transaction.amount,
        method: transaction.paymentMethod === 'cash' ? 'CASH' : 'CARD'
      },
      total: transaction.amount,
      taxTotal: transaction.taxAmount,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Theoretical implementation of printing to a fiscal printer.
   * This sends the data to a local fiscal driver service.
   */
  async printReceipt(order: Order, transaction: Transaction): Promise<boolean> {
    const receiptData = this.generateReceiptData(order, transaction);
    
    console.log("Generating Fiscal Receipt (Fiskalna Smetka)...", receiptData);

    try {
      // Example: Sending to a local driver like 'FiscalLink' or 'AccentDriver'
      // const response = await fetch('http://localhost:1234/print', {
      //   method: 'POST',
      //   body: JSON.stringify(receiptData)
      // });
      
      // For now, we simulate a successful print
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log("Fiscal Receipt Printed Successfully");
          resolve(true);
        }, 1000);
      });
    } catch (error) {
      console.error("Fiscal Printer Error:", error);
      throw new Error("Could not connect to fiscal printer. Please check the driver.");
    }
  }
};
