import express, { Request, Response } from 'express';
import { SerialPort } from 'serialport';
import iconv from 'iconv-lite';

const app = express();
const PORT = 8181;

app.use(express.json());

// Enable CORS for local POS app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

import { DunaExeDriver, FiscalReceiptPayload } from './dunaExeDriver';


class DunaDatecsDriver {
  private port: SerialPort | null = null;
  private currentPortName: string = 'COM1';
  private baudRate: number = 9600;
  private sequenceNumber: number = 0x20;
  private isSimulator: boolean = true;

  constructor() {
    this.detectAndConnect();
  }

  public async getAvailablePorts(): Promise<string[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map(p => p.path);
    } catch {
      return [];
    }
  }

  public async detectAndConnect(preferredPort?: string) {
    try {
      const ports = await SerialPort.list();
      let targetPort = preferredPort;

      if (!targetPort && ports.length > 0) {
        // Look for common USB-to-Serial or Datecs adapters
        const found = ports.find(p => 
          (p.manufacturer && /datecs|prolific|ftdi|ch340|silicon/i.test(p.manufacturer)) ||
          /usb/i.test(p.path)
        );
        targetPort = found ? found.path : ports[0].path;
      }

      if (targetPort) {
        this.currentPortName = targetPort;
        if (this.port && this.port.isOpen) {
          await new Promise<void>((resolve) => this.port?.close(() => resolve()));
        }

        this.port = new SerialPort({
          path: this.currentPortName,
          baudRate: this.baudRate,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          autoOpen: false
        });

        await new Promise<void>((resolve, reject) => {
          this.port?.open((err) => {
            if (err) {
              console.log(`[Duna/Datecs] Could not open ${this.currentPortName}. Running in Simulator Mode.`);
              this.isSimulator = true;
              resolve();
            } else {
              console.log(`[Duna/Datecs] Successfully connected to ${this.currentPortName} at ${this.baudRate} baud.`);
              this.isSimulator = false;
              resolve();
            }
          });
        });
      } else {
        console.log('[Duna/Datecs] No physical COM ports detected. Running in Simulator Mode.');
        this.isSimulator = true;
      }
    } catch (err) {
      console.error('[Duna/Datecs] Connection error:', err);
      this.isSimulator = true;
    }
  }

  public getStatus() {
    return {
      connected: !this.isSimulator && !!this.port?.isOpen,
      simulator: this.isSimulator,
      port: this.currentPortName,
      baudRate: this.baudRate
    };
  }

  /**
   * Build Datecs/DUNA packet:
   * <0x01><LEN><SEQ><CMD><DATA><0x05><BCC><0x03>
   */
  private buildPacket(cmd: number, data: string = ''): Buffer {
    const seq = this.sequenceNumber;
    this.sequenceNumber++;
    if (this.sequenceNumber > 0x7f) this.sequenceNumber = 0x20;

    // Encode text using Windows-1251 (CP1251) which is standard for Macedonian Datecs & DUNA fiscal registers
    const dataBuf = iconv.encode(data, 'win1251');
    const len = dataBuf.length + 4 + 0x20; // SEQ(1) + CMD(1) + DATA + 0x05(1) + 1 + 0x20 offset

    const packetParts = [
      Buffer.from([0x01, len, seq, cmd]),
      dataBuf,
      Buffer.from([0x05])
    ];
    const rawBody = Buffer.concat(packetParts);

    // Calculate BCC checksum: Sum of bytes from LEN to 0x05
    let bcc = 0;
    for (let i = 1; i < rawBody.length; i++) {
      bcc += rawBody[i];
    }
    bcc = bcc & 0xffff;
    const bccHex = bcc.toString(16).toUpperCase().padStart(4, '0');

    return Buffer.concat([
      rawBody,
      Buffer.from(bccHex, 'ascii'),
      Buffer.from([0x03])
    ]);
  }

  private async sendCommand(cmd: number, data: string = ''): Promise<boolean> {
    if (this.isSimulator || !this.port || !this.port.isOpen) {
      console.log(`[SIMULATOR] [DUNA COMMAND 0x${cmd.toString(16).toUpperCase()}] ${data}`);
      return true;
    }

    const packet = this.buildPacket(cmd, data);
    return new Promise((resolve) => {
      this.port?.write(packet, (err) => {
        if (err) {
          console.error('[Duna/Datecs] Write error:', err);
          resolve(false);
        } else {
          // Give printer time to acknowledge
          setTimeout(() => resolve(true), 120);
        }
      });
    });
  }

  /**
   * Print a real fiscal receipt
   */
  public async printFiscalReceipt(payload: FiscalReceiptPayload): Promise<{ success: boolean; message: string }> {
    console.log(`\n========================================`);
    console.log(`[FISCAL PRINTER] Printing Order #${payload.orderId}`);
    console.log(`Mode: ${this.isSimulator ? 'SIMULATOR (Virtual)' : 'PHYSICAL HARDWARE (' + this.currentPortName + ')'}`);
    console.log(`========================================`);

    try {
      // 1. Open Fiscal Receipt (CMD 0x30 / 48)
      // Data: Operator Number \t Password \t Register number
      const op = payload.operatorId || '1';
      const pass = payload.operatorPassword || '0000';
      await this.sendCommand(0x30, `${op}\t${pass}\t1`);

      // 2. Register Each Item (CMD 0x31 / 49)
      // Data: ItemName \t TaxGroup Price * Quantity
      // Tax groups: 1 or 'A' (18%), 2 or 'B' (5%), 3 or 'V' (0%), 4 or 'G' (10%)
      for (const item of payload.items) {
        const cleanName = item.name.substring(0, 20).replace(/[\t\r\n]/g, ' ');
        const taxGroupCode = item.taxGroup === 'B' ? '2' : (item.taxGroup === 'G' ? '4' : (item.taxGroup === 'V' ? '3' : '1'));
        const priceStr = item.price.toFixed(2);
        const qtyStr = item.quantity.toFixed(3);
        
        console.log(`  - ${cleanName.padEnd(20)} ${qtyStr} x ${priceStr} MKD [DDV ${item.taxGroup}]`);
        await this.sendCommand(0x31, `${cleanName}\t${taxGroupCode}${priceStr}*${qtyStr}`);
      }

      // 3. Subtotal (CMD 0x33 / 51)
      await this.sendCommand(0x33, `1\t1`);

      // 4. Payment & Close Receipt (CMD 0x35 / 53)
      // 'P' for Cash (Готово), 'C' for Card (Картичка)
      if (payload.splitCard && payload.splitCard > 0 && payload.splitCash && payload.splitCash > 0) {
        console.log(`  Payment (SPLIT): CASH (${payload.splitCash.toFixed(2)} MKD) + CARD (${payload.splitCard.toFixed(2)} MKD)`);
        // First tender cash amount
        await this.sendCommand(0x35, `P\t${payload.splitCash.toFixed(2)}`);
        // Then tender card amount
        await this.sendCommand(0x35, `C\t${payload.splitCard.toFixed(2)}`);
      } else {
        const payType = payload.paymentMethod === 'card' ? 'C' : 'P';
        const totalStr = payload.total.toFixed(2);
        console.log(`  Payment: ${payload.paymentMethod.toUpperCase()} (${totalStr} MKD)`);
        await this.sendCommand(0x35, `${payType}\t${totalStr}`);
      }

      // 5. Close Receipt (CMD 0x38 / 56)
      await this.sendCommand(0x38, ``);

      console.log(`========================================`);
      console.log(`[FISCAL PRINTER] Receipt Completed Successfully\n`);

      return { success: true, message: 'Fiscal receipt printed successfully' };
    } catch (err: any) {
      console.error('[FISCAL PRINTER] Error printing receipt:', err);
      return { success: false, message: err?.message || 'Error communicating with printer' };
    }
  }

  /**
   * Print a Storno (Reversal / Void) fiscal receipt
   */
  public async printStornoReceipt(payload: FiscalReceiptPayload): Promise<{ success: boolean; message: string }> {
    console.log(`\n========================================`);
    console.log(`[FISCAL PRINTER] Printing STORNO (Reversal) for Order #${payload.orderId}`);
    console.log(`Mode: ${this.isSimulator ? 'SIMULATOR (Virtual)' : 'PHYSICAL HARDWARE (' + this.currentPortName + ')'}`);
    console.log(`========================================`);

    try {
      const op = payload.operatorId || '1';
      const pass = payload.operatorPassword || '0000';
      await this.sendCommand(0x30, `${op}\t${pass}\t1\t${payload.orderId}\tR`);

      for (const item of payload.items) {
        const cleanName = item.name.substring(0, 20).replace(/[\t\r\n]/g, ' ');
        const taxGroupCode = item.taxGroup === 'B' ? '2' : (item.taxGroup === 'G' ? '4' : (item.taxGroup === 'V' ? '3' : '1'));
        const priceStr = item.price.toFixed(2);
        const qtyStr = item.quantity.toFixed(3);
        console.log(`  [STORNO] - ${cleanName.padEnd(20)} ${qtyStr} x ${priceStr} MKD [DDV ${item.taxGroup}]`);
        await this.sendCommand(0x31, `${cleanName}\t${taxGroupCode}${priceStr}*${qtyStr}`);
      }

      await this.sendCommand(0x33, `1\t1`);

      const payType = payload.paymentMethod === 'card' ? 'C' : 'P';
      const totalStr = payload.total.toFixed(2);
      await this.sendCommand(0x35, `${payType}\t${totalStr}`);

      await this.sendCommand(0x38, ``);

      console.log(`[FISCAL PRINTER] STORNO Completed Successfully\n`);
      return { success: true, message: 'Storno fiscal receipt printed successfully' };
    } catch (err: any) {
      console.error('[FISCAL PRINTER] Error printing storno receipt:', err);
      return { success: false, message: err?.message || 'Error communicating with printer' };
    }
  }

  /**
   * Print a Non-Fiscal Test Slip (Safe, does not touch tax memory)
   */
  public async printTestSlip(): Promise<{ success: boolean; message: string }> {
    console.log(`\n--- [NON-FISCAL TEST SLIP] Starting Print ---`);
    try {
      // 1. Open Non-Fiscal Receipt (CMD 0x26 / 38)
      await this.sendCommand(0x26, `1\t0000`);

      // 2. Print Non-Fiscal Text Lines (CMD 0x2A / 42)
      const lines = [
        '================================',
        '        ZEZ-POS TEST SLIP       ',
        '      DUNA MAESTRAL PRINTER     ',
        '================================',
        `Date: ${new Date().toLocaleString()}`,
        'Status: Connection Established!',
        'Baud:   9600 8N1 (Mode 6. PC)   ',
        '--------------------------------',
        '   *** НЕФИСКАЛНА СМЕТКА ***    ',
        '================================'
      ];

      for (const line of lines) {
        console.log(`  ${line}`);
        await this.sendCommand(0x2A, line.substring(0, 32));
      }

      // 3. Close Non-Fiscal Receipt (CMD 0x27 / 39)
      await this.sendCommand(0x27, ``);
      console.log(`--- [NON-FISCAL TEST SLIP] Completed Successfully ---\n`);

      return { success: true, message: 'Test slip printed successfully' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to print test slip' };
    }
  }

  /**
   * Daily Financial Report (Z-Report / Нулирање / ДФИ)
   */
  public async printDailyReport(type: 'Z' | 'X' = 'Z'): Promise<{ success: boolean; message: string }> {
    try {
      if (type === 'Z') {
        // Daily Report with Nulling (CMD 0x45 / 69)
        console.log('[FISCAL PRINTER] Printing Daily Financial Report (Z-Report / ДФИ)...');
        await this.sendCommand(0x45, '0');
      } else {
        // Read-only Control Report (CMD 0x46 / 70)
        console.log('[FISCAL PRINTER] Printing Control Report (X-Report / Читање)...');
        await this.sendCommand(0x46, '0');
      }
      return { success: true, message: `${type}-Report printed successfully` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to print report' };
    }
  }

  /**
   * Cash In / Cash Out (Службен влез / службен излез на готовина)
   * Datecs CMD 0x46 (70) or CMD 0x39 (57) for Cash Operations
   */
  public async printCashOperation(type: 'in' | 'out', amount: number): Promise<{ success: boolean; message: string }> {
    console.log(`\n========================================`);
    console.log(`[FISCAL PRINTER] Cash ${type === 'in' ? 'IN (Влез)' : 'OUT (Излез)'}: ${amount.toFixed(2)} MKD`);
    console.log(`Mode: ${this.isSimulator ? 'SIMULATOR (Virtual)' : 'PHYSICAL HARDWARE (' + this.currentPortName + ')'}`);
    console.log(`========================================`);

    try {
      // Datecs format: 0 = Cash In, 1 = Cash Out
      const opCode = type === 'in' ? '0' : '1';
      const amountStr = amount.toFixed(2);
      await this.sendCommand(0x46, `${opCode}\t${amountStr}`);

      return {
        success: true,
        message: type === 'in'
          ? `Службен влез на ${amountStr} ден е евидентиран`
          : `Службен излез на ${amountStr} ден е евидентиран`
      };
    } catch (err: any) {
      console.error('[FISCAL PRINTER] Cash operation error:', err);
      return { success: false, message: err?.message || 'Failed to register cash operation' };
    }
  }
}

const driver = new DunaExeDriver();

// Endpoints
app.get('/api/fiscal/status', async (req: Request, res: Response) => {
  const status = driver.getStatus();
  const availablePorts = await driver.getAvailablePorts();
  res.json({ ...status, availablePorts });
});

app.post('/api/fiscal/configure', async (req: Request, res: Response) => {
  const { port } = req.body;
  if (port) {
    await driver.detectAndConnect(port);
  }
  res.json(driver.getStatus());
});

app.post('/api/fiscal/receipt', async (req: Request, res: Response) => {
  const payload: FiscalReceiptPayload = req.body;
  if (!payload || !payload.items) {
    return res.status(400).json({ success: false, message: 'Invalid receipt payload' });
  }
  const result = await driver.printFiscalReceipt(payload);
  res.json(result);
});

app.post('/api/fiscal/test-slip', async (req: Request, res: Response) => {
  const result = await driver.printTestSlip();
  res.json(result);
});

app.post('/api/fiscal/daily-report', async (req: Request, res: Response) => {
  const { type } = req.body; // 'Z' or 'X'
  const result = await driver.printDailyReport(type === 'X' ? 'X' : 'Z');
  res.json(result);
});

app.post('/api/fiscal/cash-operation', async (req: Request, res: Response) => {
  const { type, amount } = req.body; // 'in' or 'out'
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid cash amount' });
  }
  const result = await driver.printCashOperation(type === 'out' ? 'out' : 'in', parsedAmount);
  res.json(result);
});

app.post('/api/fiscal/storno', async (req: Request, res: Response) => {
  const payload: FiscalReceiptPayload = req.body;
  if (!payload || !payload.items) {
    return res.status(400).json({ success: false, message: 'Invalid storno payload' });
  }
  const result = await driver.printStornoReceipt(payload);
  res.json(result);
});

export function startBridgeServer(port = PORT) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`  🚀 Duna Maestral Fiscal Bridge Server Running!`);
    console.log(`  📡 Listening on: http://0.0.0.0:${port}`);
    console.log(`  🔌 Bridge connects to: Duna Maestral / Datecs (Mode 6. PC)`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[FISCAL BRIDGE] Port ${port} is already in use. Using existing bridge.`);
    } else {
      console.error('[FISCAL BRIDGE] Server error:', err);
    }
  });

  return server;
}

// Auto-start if run directly from CLI
if (process.argv[1]?.includes('fiscalBridge')) {
  startBridgeServer(PORT);
}
