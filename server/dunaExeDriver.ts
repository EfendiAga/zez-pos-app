import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface FiscalItem {
  name: string;
  price: number;
  quantity: number;
  taxGroup: 'A' | 'B' | 'V' | 'G'; // A=18%, B=5%, V=0%, G=10%
}

export interface FiscalReceiptPayload {
  orderId: string;
  items: FiscalItem[];
  paymentMethod: 'cash' | 'card';
  total: number;
  splitCash?: number;
  splitCard?: number;
  operatorId?: string;
  operatorPassword?: string;
}

export class DunaExeDriver {
  private razvigorecPath = path.join(__dirname, '../../drivers/RAZVIGOREC/Razvigorec.exe');
  private driverDir = path.join(__dirname, '../../drivers/RAZVIGOREC');

  constructor() {
    if (!fs.existsSync(this.razvigorecPath)) {
      console.warn(`[DunaExeDriver] WARNING: Could not find Razvigorec.exe at ${this.razvigorecPath}`);
    }
  }

  public getStatus() {
    const exists = fs.existsSync(this.razvigorecPath);
    return {
      connected: exists,
      simulator: !exists,
      port: 'EXE-MODE',
      baudRate: 0
    };
  }

  public async getAvailablePorts(): Promise<string[]> {
    return ['EXE-MODE'];
  }
  
  public async detectAndConnect(port?: string) {
    // nothing to do
  }

  private async executeRazvigorec(filename: string, content: string): Promise<{ success: boolean; message: string }> {
    if (!fs.existsSync(this.razvigorecPath)) {
      console.log(`[SIMULATOR] EXE Driver not found. Printing to console:`);
      console.log(content);
      return { success: true, message: 'Simulator print success' };
    }

    const filePath = path.join(this.driverDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');

    return new Promise((resolve) => {
      execFile(this.razvigorecPath, [filename], { cwd: this.driverDir }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[DunaExeDriver] Execution error:`, error);
          resolve({ success: false, message: 'Failed to run printer driver' });
        } else {
          resolve({ success: true, message: 'Command executed successfully' });
        }
      });
    });
  }

  public async printFiscalReceipt(payload: FiscalReceiptPayload): Promise<{ success: boolean; message: string }> {
    let content = `#F\n`;
    for (const item of payload.items) {
      const cleanName = item.name.substring(0, 20).replace(/;/g, ' ');
      // @Item Name;TaxGroup;Price;Quantity
      content += `@${cleanName};${item.taxGroup};${item.price.toFixed(2)};${item.quantity.toFixed(3)}\n`;
    }

    if (payload.splitCard && payload.splitCard > 0 && payload.splitCash && payload.splitCash > 0) {
      content += `#M${(payload.splitCash * 100).toFixed(0)};${(payload.splitCard * 100).toFixed(0)}\n`;
    } else if (payload.paymentMethod === 'card') {
      content += `#K${payload.total.toFixed(2)}\n`;
    } else {
      content += `#G${payload.total.toFixed(2)}\n`;
    }

    return this.executeRazvigorec('receipt.txt', content);
  }

  public async printStornoReceipt(payload: FiscalReceiptPayload): Promise<{ success: boolean; message: string }> {
    let content = `#S\n`;
    for (const item of payload.items) {
      const cleanName = item.name.substring(0, 20).replace(/;/g, ' ');
      content += `@${cleanName};${item.taxGroup};${item.price.toFixed(2)};${item.quantity.toFixed(3)}\n`;
    }

    if (payload.paymentMethod === 'card') {
      content += `#K${payload.total.toFixed(2)}\n`;
    } else {
      content += `#G${payload.total.toFixed(2)}\n`;
    }

    return this.executeRazvigorec('storno.txt', content);
  }

  public async printTestSlip(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Test slip not supported in EXE mode' };
  }

  public async printDailyReport(type: 'Z' | 'X' = 'Z'): Promise<{ success: boolean; message: string }> {
    let content = type === 'Z' ? `#Z\n` : `#X\n`;
    return this.executeRazvigorec('report.txt', content);
  }

  public async printCashOperation(type: 'in' | 'out', amount: number): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Cash operations not yet mapped for EXE mode' };
  }
}
