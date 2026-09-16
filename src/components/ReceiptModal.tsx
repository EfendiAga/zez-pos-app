import React, { useRef } from 'react';
import { Order, Transaction, Business } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, X, Check } from 'lucide-react';
import { Button } from './ui/button';
import { computeLineSubtotal, formatMKD } from '../lib/money';

interface ReceiptModalProps {
  order: Order;
  transaction: Transaction;
  business: Business | null;
  onClose: () => void;
}

export function ReceiptModal({ order, transaction, business, onClose }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = receiptRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Receipt #${order.id.slice(-8).toUpperCase()}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; font-size: 12px; padding: 16px; max-width: 300px; }
            .receipt-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px dashed #000; }
            .receipt-header h1 { font-size: 18px; font-weight: bold; }
            .item-row { display: flex; justify-content: space-between; margin: 4px 0; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
            .discount-row { display: flex; justify-content: space-between; color: #555; }
            .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          ${content}
          <div class="footer">
            <p>Ви благодариме за посетата!</p>
            <p>Thank you for your visit!</p>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  const date = new Date(transaction.createdAt);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Check className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-black text-zinc-900 text-sm">Payment Complete</p>
              <p className="text-xs text-zinc-400">#{order.id.slice(-8).toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-100">
            <X className="h-4 w-4 text-zinc-400" />
          </button>
        </div>

        {/* Printable receipt body */}
        <div ref={receiptRef} className="px-6 py-4 font-mono text-sm space-y-3">
          {/* Business header */}
          <div className="receipt-header text-center mb-3">
            <h1 className="font-black text-lg text-zinc-900">{business?.name || 'easyPOS'}</h1>
            <p className="text-xs text-zinc-500">{business?.type?.toUpperCase()}</p>
            <p className="text-xs text-zinc-400 mt-1">
              {date.toLocaleDateString('mk-MK')} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {order.tableNumber && (
              <p className="text-xs font-bold text-zinc-600 mt-1">Table {order.tableNumber}</p>
            )}
          </div>

          <div className="divider border-t border-dashed border-zinc-300" />

          {/* Items */}
          <div className="space-y-1.5">
            {order.items.map((item, i) => (
              <div key={i} className="item-row flex justify-between text-xs text-zinc-800">
                <span className="flex-1">
                  <span className="font-bold">{item.quantity}x</span> {item.name}
                  {item.notes && <span className="text-zinc-400 italic"> ({item.notes})</span>}
                </span>
                <span className="font-bold ml-4">{formatMKD(computeLineSubtotal(item))}</span>
              </div>
            ))}
          </div>

          <div className="divider border-t border-dashed border-zinc-300" />

          {/* Totals */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Subtotal</span>
              <span>{formatMKD(order.subtotal || order.total)}</span>
            </div>
            {order.discount && order.discount > 0 && (
              <div className="discount-row flex justify-between text-xs text-emerald-600 font-semibold">
                <span>Discount {order.discountType === 'percent' ? `(${order.discountPercent}%)` : ''}</span>
                <span>− {formatMKD(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-zinc-500">
              <span>DDV ({business?.taxRate || 18}%)</span>
              <span>{formatMKD(transaction.taxAmount)}</span>
            </div>
            <div className="total-row flex justify-between text-base font-black text-zinc-900 pt-1 border-t border-zinc-200">
              <span>ВКУПНО / TOTAL</span>
              <span>{formatMKD(order.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-400 mt-1">
              <span>Payment</span>
              <span className="capitalize font-semibold">{transaction.paymentMethod}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <Button
            className="flex-1 h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 font-bold"
            onClick={handlePrint}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Receipt
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-2xl border-zinc-200 font-bold"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
