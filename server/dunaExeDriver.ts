import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { SerialPort } from 'serialport';

/**
 * Driver for Duna Maestral (Маестрал) fiscal registers via Razvigorec.exe.
 *
 * How Razvigorec.exe works (from drivers/RAZVIGOREC docs + examples):
 *  - It always reads the command file `Razvigorec.txt` from its own folder.
 *  - The COM port is read from `Razvigorec.ini` (single line, e.g. "COM3").
 *  - Files are Windows-1251 encoded with CRLF line endings.
 *  - Result is written to `Result.out`; the line "Број на фискална сметка: N"
 *    contains the receipt number (0 / empty = printer did not respond).
 *
 * Commands:
 *   #F fiscal receipt, #S storno, #Z daily report (DFI), #X control report
 *   @Name;TaxGroup;Price;Quantity
 *   #G1000 cash, #K1000 card, #M3000;2000 cash+card (whole denars)
 */

function getSourceDriverDir(driverName: string) {
  if (process.versions && process.versions.electron) {
    // Dynamic require so plain Node (tsx) runs are not affected
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'drivers', driverName);
    }
  }
  return path.join(__dirname, '../drivers', driverName);
}

/**
 * In the installed app, the program folder may be read-only, but Razvigorec.exe
 * needs to write Razvigorec.txt / Result.out next to itself. So we copy the
 * driver into the user's AppData folder once and run it from there.
 */
function getWorkingDriverDir(driverName: string) {
  const source = getSourceDriverDir(driverName);
  if (process.versions && process.versions.electron) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && app.isPackaged) {
      const target = path.join(app.getPath('userData'), 'drivers', driverName);
      try {
        if (!fs.existsSync(path.join(target, 'Razvigorec.exe')) && fs.existsSync(source)) {
          fs.mkdirSync(target, { recursive: true });
          fs.cpSync(source, target, { recursive: true });
        }
        return target;
      } catch (err) {
        console.error('[DunaExeDriver] Could not copy driver to user data, using install folder:', err);
      }
    }
  }
  return source;
}

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

type DriverResult = { success: boolean; message: string; receiptNumber?: string };

export class DunaExeDriver {
  private driverDir = getWorkingDriverDir('RAZVIGOREC');
  private razvigorecPath = path.join(this.driverDir, 'Razvigorec.exe');
  private iniPath = path.join(this.driverDir, 'Razvigorec.ini');
  private commandPath = path.join(this.driverDir, 'Razvigorec.txt');
  private resultPath = path.join(this.driverDir, 'Result.out');
  // Serialize jobs so two receipts never overwrite Razvigorec.txt at the same time
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    if (!fs.existsSync(this.razvigorecPath)) {
      console.warn(`[DunaExeDriver] WARNING: Could not find Razvigorec.exe at ${this.razvigorecPath}`);
    } else {
      console.log(`[DunaExeDriver] Using driver at ${this.razvigorecPath} (port ${this.getConfiguredPort()})`);
    }
  }

  private getConfiguredPort(): string {
    try {
      const raw = fs.readFileSync(this.iniPath, 'latin1');
      const port = raw.split(/\r?\n/)[0].trim();
      return port || 'COM1';
    } catch {
      return 'COM1';
    }
  }

  public getStatus() {
    const exists = fs.existsSync(this.razvigorecPath);
    return {
      connected: exists,
      simulator: !exists,
      port: this.getConfiguredPort(),
      baudRate: 0,
      driverPath: this.razvigorecPath
    };
  }

  public async getAvailablePorts(): Promise<string[]> {
    try {
      const ports = await SerialPort.list();
      const list = ports.map(p => p.path);
      const current = this.getConfiguredPort();
      if (!list.includes(current)) list.unshift(current);
      return list;
    } catch {
      return [this.getConfiguredPort()];
    }
  }

  /** Called from Settings when the user picks a COM port: writes Razvigorec.ini */
  public async detectAndConnect(port?: string) {
    if (!port || !/^COM\d+$/i.test(port)) return;
    try {
      fs.writeFileSync(this.iniPath, `${port.toUpperCase()}\r\n`, 'latin1');
      console.log(`[DunaExeDriver] COM port set to ${port.toUpperCase()}`);
    } catch (err) {
      console.error('[DunaExeDriver] Could not write Razvigorec.ini:', err);
    }
  }

  private cleanName(name: string) {
    return name.replace(/[;\r\n@#]/g, ' ').trim().substring(0, 32) || 'Artikal';
  }

  private itemLine(item: FiscalItem) {
    const group = ['A', 'B', 'V', 'G'].includes(item.taxGroup) ? item.taxGroup : 'A';
    return `@${this.cleanName(item.name)};${group};${item.price.toFixed(2)};${item.quantity.toFixed(3)}`;
  }

  /** Razvigorec expects whole denars for payments (#G1000 = 1.000,00 ден) */
  private den(amount: number) {
    return Math.round(amount).toString();
  }

  private paymentLine(payload: FiscalReceiptPayload) {
    const itemsTotal = payload.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const total = Math.max(payload.total || 0, itemsTotal);
    if (payload.splitCard && payload.splitCard > 0 && payload.splitCash && payload.splitCash > 0) {
      const card = Math.round(payload.splitCard);
      const cash = Math.max(Math.round(total) - card, 0);
      return `#M${cash};${card}`;
    }
    return payload.paymentMethod === 'card' ? `#K${this.den(total)}` : `#G${this.den(total)}`;
  }

  private readResult(): { text: string; receiptNumber: string | null } {
    try {
      const text = iconv.decode(fs.readFileSync(this.resultPath), 'win1251');
      const match = text.match(/сметка:\s*(\d+)/i);
      return { text, receiptNumber: match ? match[1] : null };
    } catch {
      return { text: '', receiptNumber: null };
    }
  }

  private run(lines: string[], expectReceipt: boolean): Promise<DriverResult> {
    const job = this.queue.then(() => this.execute(lines, expectReceipt));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async execute(lines: string[], expectReceipt: boolean): Promise<DriverResult> {
    const content = lines.join('\r\n') + '\r\n';

    if (!fs.existsSync(this.razvigorecPath)) {
      console.log(`[SIMULATOR] Razvigorec.exe not found. Would send:\n${content}`);
      return { success: true, message: 'Simulator print success' };
    }

    try {
      fs.writeFileSync(this.commandPath, iconv.encode(content, 'win1251'));
      if (fs.existsSync(this.resultPath)) fs.unlinkSync(this.resultPath);
    } catch (err: any) {
      return { success: false, message: `Cannot write driver file: ${err?.message}` };
    }

    console.log(`[DunaExeDriver] Sending to ${this.getConfiguredPort()}:\n${content}`);

    return new Promise((resolve) => {
      execFile(this.razvigorecPath, [], { cwd: this.driverDir, timeout: 90000, windowsHide: true }, (error) => {
        const result = this.readResult();
        console.log(`[DunaExeDriver] Result.out:\n${result.text}`);

        if (error) {
          resolve({ success: false, message: `Driver error: ${error.message}` });
          return;
        }
        if (expectReceipt && (!result.receiptNumber || result.receiptNumber === '0')) {
          resolve({
            success: false,
            message: `Печатачот не одговори на ${this.getConfiguredPort()}. Проверете COM порта и дали касата е во режим "6. ПЦ".`
          });
          return;
        }
        resolve({
          success: true,
          message: result.receiptNumber ? `Фискална сметка бр. ${result.receiptNumber}` : 'Command executed successfully',
          receiptNumber: result.receiptNumber || undefined
        });
      });
    });
  }

  public async printFiscalReceipt(payload: FiscalReceiptPayload): Promise<DriverResult> {
    const lines = ['#F', ...payload.items.map(i => this.itemLine(i)), this.paymentLine(payload)];
    return this.run(lines, true);
  }

  public async printStornoReceipt(payload: FiscalReceiptPayload): Promise<DriverResult> {
    const lines = ['#S', ...payload.items.map(i => this.itemLine(i)), this.paymentLine({ ...payload, splitCard: 0, splitCash: 0 })];
    return this.run(lines, true);
  }

  public async printTestSlip(): Promise<DriverResult> {
    // Razvigorec has no non-fiscal slip; an X report is safe (does not reset the day)
    return this.run(['#X'], false);
  }

  public async printDailyReport(type: 'Z' | 'X' = 'Z'): Promise<DriverResult> {
    return this.run([type === 'Z' ? '#Z' : '#X'], false);
  }

  public async printCashOperation(_type: 'in' | 'out', _amount: number): Promise<DriverResult> {
    return { success: false, message: 'Службен влез/излез не е поддржан од Razvigorec драјверот — внесете го на касата (+%).' };
  }
}
