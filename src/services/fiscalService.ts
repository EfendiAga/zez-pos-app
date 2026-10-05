import { Order, Transaction, OrderItem } from '../types';

/**
 * Macedonian Fiscal Tax Groups (Standard mapping)
 * A - 18% (General)
 * B - 5% (Preferential / Food staples / Bread)
 * V - 0% (Exempt)
 * G - 10% (Specific)
 */
export type FiscalTaxGroup = 'A' | 'B' | 'V' | 'G';

export interface FiscalReceiptData {
  orderId: string;
  items: {
    name: string;
    price: number;
    quantity: number;
    taxGroup: FiscalTaxGroup;
  }[];
  paymentMethod: 'cash' | 'card';
  total: number;
  timestamp: string;
}

const getBridgeUrl = () => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8181`;
  }
  return 'http://localhost:8181';
};

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
   * Checks the connection and status of the Duna Maestral fiscal bridge.
   */
  async getStatus(): Promise<{ connected: boolean; simulator: boolean; port: string; availablePorts: string[] }> {
    try {
      const res = await fetch(`${getBridgeUrl()}/api/fiscal/status`);
      if (!res.ok) throw new Error('Bridge unreachable');
      return await res.json();
    } catch {
      return { connected: false, simulator: true, port: 'Offline', availablePorts: [] };
    }
  },

  /**
   * Configure the target COM port on the bridge.
   */
  async configurePort(port: string) {
    try {
      const res = await fetch(`${getBridgeUrl()}/api/fiscal/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      });
      return await res.json();
    } catch (e) {
      console.error('Failed to configure COM port:', e);
      return null;
    }
  },

  /**
   * Prints an official fiscal receipt on the Duna Maestral via the local bridge.
   */
  async printReceipt(
    order: Order,
    paymentMethod: 'cash' | 'card' = 'cash',
    splitDetails?: { cashAmount: number; cardAmount: number }
  ): Promise<boolean> {
    const payload = {
      orderId: order.id,
      items: order.items.map(item => ({
        name: item.name.substring(0, 20),
        price: item.price,
        quantity: item.quantity,
        taxGroup: (item.taxGroup as any) || this.getTaxGroup(item.taxRate)
      })),
      paymentMethod,
      splitCash: splitDetails?.cashAmount,
      splitCard: splitDetails?.cardAmount,
      total: order.total,
      timestamp: new Date().toISOString()
    };

    console.log('[FISCAL SERVICE] Sending receipt to bridge:', payload);

    try {
      const response = await fetch(`${getBridgeUrl()}/api/fiscal/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Fiscal Bridge returned status ${response.status}`);
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.warn('[FISCAL SERVICE] Fiscal printer bridge not reachable or offline. Order recorded locally.', error);
      return false;
    }
  },

  /**
   * Prints a safe non-fiscal test slip to test paper roll and hardware communication.
   */
  async printTestSlip(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${getBridgeUrl()}/api/fiscal/test-slip`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: 'Fiscal bridge is not running on port 8181' };
    }
  },

  /**
   * Prints a Daily Financial Report (Z-Report / DFI / Нулирање) or Control Report (X-Report / Читање)
   */
  async printDailyReport(type: 'Z' | 'X' = 'Z'): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${getBridgeUrl()}/api/fiscal/daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: 'Fiscal bridge is not running on port 8181' };
    }
  },

  /**
   * Prints a Cash In / Cash Out receipt (Службен влез / службен излез) on Duna Maestral
   */
  async printCashOperation(type: 'in' | 'out', amount: number): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${getBridgeUrl()}/api/fiscal/cash-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, amount })
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: 'Fiscal bridge is not running on port 8181' };
    }
  },

  /**
   * Prints an official Storno (Void/Reversal) fiscal receipt
   */
  async printStorno(order: Order, paymentMethod: 'cash' | 'card' = 'cash'): Promise<boolean> {
    const payload = {
      orderId: order.id,
      items: order.items.map(item => ({
        name: item.name.substring(0, 20),
        price: item.price,
        quantity: item.quantity,
        taxGroup: (item.taxGroup as any) || this.getTaxGroup(item.taxRate)
      })),
      paymentMethod,
      total: order.total,
      timestamp: new Date().toISOString()
    };

    console.log('[FISCAL SERVICE] Sending STORNO to bridge:', payload);

    try {
      const response = await fetch(`${getBridgeUrl()}/api/fiscal/storno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.success;
    } catch (error) {
      console.warn('[FISCAL SERVICE] Failed to send Storno to fiscal printer:', error);
      return false;
    }
  }
};
