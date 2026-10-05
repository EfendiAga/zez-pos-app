# 🥐 Bakery & Retail POS System with Duna Maestral Fiscal Integration

A modern, fast, and resilient Point of Sale (POS) system tailored for bakeries and retail markets in North Macedonia, featuring **direct hardware integration with the DUNA Maestral (Дуна Маестрал)** fiscal cash register.

> [!TIP]
> 🇲🇰 **Комплетно Упатство на Македонски Јазик:**
> За детално објаснување на секоја опција, поврзување со Дуна Маестрал и чекор-по-чекор инструкции, погледнете го [УПАТСТВО ЗА КОРИСТЕЊЕ (UPATSTVO_ZA_KORISTENJE.md)](./UPATSTVO_ZA_KORISTENJE.md).

---

## 📌 Table of Contents
1. [System Overview](#-system-overview)
2. [Hardware Integration: Duna Maestral (Дуна Маестрал)](#-hardware-integration-duna-maestral)
3. [Alignment with the Official User Manual](#-alignment-with-the-official-user-manual)
4. [How the System Works (Architecture)](#-how-the-system-works-architecture)
5. [Day-to-Day Operating Guide for Staff](#-day-to-day-operating-guide-for-staff)
6. [Macedonian Tax & DDV Mapping](#-macedonian-tax--ddv-mapping)
7. [Installation & Setup Instructions](#-installation--setup-instructions)
8. [Troubleshooting & Verification](#-troubleshooting--verification)

---

## 🏬 System Overview

The application is built for high-speed counter checkout, offline-first reliability, and Macedonian legal compliance:
- **Offline-First Database (Dexie/IndexedDB):** Never loses sales or freezes if the internet drops.
- **Product & Inventory Management:** Units (pieces, kg, liters), barcodes, modifiers, and DDV tax groups.
- **Cash Shifts & Till Management:** Shift opening, live cash drawers, shift closing, and reconciliation.
- **Customer Store Credit (*Вересија / Debt*):** Tracks customer debt without fiscalizing until settled.
- **Hospitality & Retail Modes:** Table management or rapid counter sales.

---

## 🖨️ Hardware Integration: Duna Maestral

The app connects to the **Duna Maestral (Дуна Маестрал)** fiscal cash register (built on the Datecs fiscal platform with an integrated GPRS crypto module communicating with the Public Revenue Office / УЈП).

Instead of requiring cashiers to type tedious item codes (`03+2=B, 03+5=O...`) on the tiny cash register keypad, the cash register operates as a **fiscal slave printer**. Your POS app automatically controls the printer over a standard USB cable.

### 🔌 Physical Connection Requirements:
- **Cable:** Direct USB cable connecting the Duna Maestral to the Windows PC.
- **Windows Port:** Recognized under Device Manager as a Virtual COM Port (e.g. `COM3`, `COM4`).
- **Baud Rate:** `9600` bps (8 Data Bits, No Parity, 1 Stop Bit - `8N1`).

---

## 📖 Alignment with the Official User Manual

The integration is designed in direct accordance with the official manual (*„УПАТСТВО ЗА КОРИСТЕЊЕ НА ФИСКАЛЕН УРЕД МАЕСТРАЛ“*):

| Feature in Official Manual | Keypad Action (Standalone) | How it Works in this POS App |
| :--- | :--- | :--- |
| **PC Connection Mode** | `9999` + `TOT` ➔ Select `6. ПЦ` | **Required mode.** Put the machine in `6. ПЦ` and leave it on the counter; all commands are sent by the computer. |
| **Регистрација (Продажба)** | Type code + `КА`, Cash (`TOT`) / Card (`KK`) | **Automated.** Cashier taps items on screen and clicks *Cash* or *Card*; app registers sale and prints slip with QR code. |
| **Попуст (Discount)** | Type discount % + `-%` + `TOT` | **Automated.** Cashier applies percentage or fixed discount in the cart; app calculates discounted base and taxes. |
| **Сторно Сметка (Void / Return)** | Press `9` + `^` + `СС` (Cash) or `8` + `^` + `СС` (Card) | **Automated.** Refunds initiated in Order History send official reversal/storno commands to cancel transactions. |
| **Читање (Контролен Извештај / X-Report)** | `9999` + `TOT` ➔ Select `2. Читање` | **1-Click Button.** In POS Settings, click **"Читање (X-Report)"** to print mid-day audit without resetting daily totals. |
| **Нулирање (Дневен Извештај / ДФИ / Z-Report)** | `9999` + `TOT` ➔ Select `3. Нулирање` | **1-Click Button.** On shift close or in Settings, click **"Нулирање / ДФИ"** to close the fiscal day and transmit data to УЈП. |
| **Службен влез / излез на пари (Float)** | Enter amount + `%+` | Supported in Cash Shift management to register starting float in the cash drawer. |

---

## 🏗️ How the System Works (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    1. POS Touchscreen UI                    │
│   (Chrome / Edge or Electron Desktop App - Port 3000)       │
│                                                             │
│   • Cashier adds items to cart                              │
│   • Selects Cash / Card / Veresija                          │
│   • Clicks "Pay"                                            │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP POST /api/fiscal/receipt
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             2. Local Fiscal Bridge (Port 8181)              │
│                 (server/fiscalBridge.ts)                    │
│                                                             │
│   • Encodes items & totals into Datecs/DUNA binary packets  │
│   • Automatically handles sequence numbering & BCC checksum │
│   • Intelligent Simulator fallback when hardware is absent  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Serial RS-232 / USB (e.g. COM3, 9600 8N1)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│       3. DUNA Maestral Fiscal Device (In Mode 6. ПЦ)        │
│                                                             │
│   • CMD 0x30: Opens fiscal receipt                          │
│   • CMD 0x31: Prints each item with 18% / 5% DDV            │
│   • CMD 0x33: Computes subtotal                             │
│   • CMD 0x35: Registers payment (P = Cash, C = Card)        │
│   • CMD 0x38: Closes receipt & prints УЈП QR code           │
└─────────────────────────────────────────────────────────────┘
```

---

## 👩‍🍳 Day-to-Day Operating Guide for Staff

### ☀️ Morning (Opening the Store)
1. Turn on the Duna Maestral cash register using the power button (red button on top right).
2. Log into the menu: enter **`9999`** and press **`TOT`**.
3. Use the arrow keys (`↑` / `↓`) to navigate to **`6. ПЦ`** and press **`TOT`**.
   * *The display will show `PC` or `Врска со ПЦ`. Leave the register in this mode.*
4. Open the POS application on your computer and start a new Cash Shift.

### 🛒 During the Day (Selling)
1. Tap product tiles on the screen to add them to the cart (or scan barcodes).
2. Choose payment method:
   - **Cash (Готово):** Click **Cash**.
   - **Card (Картичка):** Click **Card**.
   - **Debt (*Вересија*):** Select the customer and choose **Debt** (no fiscal receipt is printed until the debt is settled).
3. The Duna Maestral immediately prints the legal fiscal receipt with the official QR code and cuts the paper.

### 🌙 Evening (Closing the Day)
1. Go to **Settings** (or Shift Closing) in the POS app.
2. Click **"Нулирање / ДФИ (Z-Report)"**.
3. Confirm the prompt: the Maestral automatically prints the Daily Financial Report (*Дневен финансиски извештај*), resets the daily counters to zero, and transmits the day's totals to the Public Revenue Office (*УЈП*).

---

## 🏷️ Macedonian Tax & DDV Mapping

In the **Inventory** tab, when creating or editing products, each product has an assigned **Tax Group**:

| App Tax Group | DDV Rate | Fiscal Code Sent to Maestral | Types of Products |
| :---: | :---: | :---: | :--- |
| **A** | **18%** | `1` | General products, coffee, soda, packaged drinks, alcohol |
| **B** | **5%** | `2` | Preferential food staples, bread (*леб*), burek, baked goods, yogurt |
| **G** | **10%** | `4` | Specific goods/services |
| **V** | **0%** | `3` | Tax-exempt items |

---

## 🚀 Installation & Setup Instructions

### Prerequisites
- Windows 10 or 11 PC
- [Node.js](https://nodejs.org/) (version 18 or higher)
- Duna Maestral connected via USB

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
You can run the system in two terminals:

**Terminal 1: Start the Fiscal Bridge Server**
```bash
npm run bridge
```
*(Starts on `http://localhost:8181`. If the printer is not plugged in, it automatically runs in **Simulator Mode** for safe testing).*

**Terminal 2: Start the POS Frontend**
```bash
npm run dev
```
*(Open `http://localhost:3000` in Google Chrome or Microsoft Edge).*

---

## 🔍 Troubleshooting & Verification

### How to Test Without Generating Official Taxes:
1. Open **Settings** in the POS app.
2. Locate the **Fiscal Device (Дуна Маестрал)** card.
3. Click **"Print Test Slip (Нефискален Бон)"**:
   - The printer will feed thermal paper and print a test header clearly stamped `*** НЕФИСКАЛНА СМЕТКА ***`.
   - **Zero tax is recorded, and nothing is reported to the tax office.**

### What If the Printer Shows "Offline"?
1. Verify the USB cable is firmly connected to the PC.
2. Ensure the cash register display says **`PC`** (Mode `6. ПЦ`).
3. In **Settings**, click **Refresh** and select the active COM port (e.g. `COM3` or `COM4`).
4. Check that the cash register has enough thermal paper and the cover is locked tightly.
