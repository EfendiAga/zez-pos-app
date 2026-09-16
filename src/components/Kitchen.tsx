import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clock, Timer, UtensilsCrossed } from 'lucide-react';
import { db, useLiveQuery } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { resolveBusinessConfig } from '../lib/permissions';
import { Business, Order } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { cn } from '../lib/utils';

const ACTIVE_KITCHEN_STATUSES: Order['status'][] = ['pending', 'preparing', 'ready'];

export function Kitchen() {
  const { profile } = useAuth();
  const business = useLiveQuery<Business | undefined>(() => (profile?.businessId ? db.businesses.get(profile.businessId) : undefined), [profile?.businessId]);
  const orders = (useLiveQuery<Order[]>(
    () => (profile?.businessId ? db.orders.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as Order[];

  const config = resolveBusinessConfig(business || null);
  const kitchenOrders = useMemo(
    () =>
      orders
        .filter((order) => ACTIVE_KITCHEN_STATUSES.includes((order.status || 'pending') as Order['status']) && order.kitchenStatus !== 'not_required')
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()),
    [orders]
  );

  const updateStatus = async (order: Order, nextStatus: Order['status'], nextKitchenStatus: Order['kitchenStatus']) => {
    await db.orders.update(order.id, {
      status: nextStatus,
      kitchenStatus: nextKitchenStatus,
    });
  };

  const kitchenLabel = config?.kitchenLabel || 'Kitchen';

  if (business === undefined) {
    return <div className="text-zinc-500">Loading {kitchenLabel.toLowerCase()}...</div>;
  }

  if (!config?.hasKitchenDisplay) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 bg-white rounded-3xl border border-dashed border-zinc-200">
        <UtensilsCrossed className="h-16 w-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">{kitchenLabel} is not used for this business type</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{kitchenLabel} Display</h2>
          <p className="text-zinc-500">Only live hospitality tickets for this business.</p>
        </div>
        <Badge variant="outline" className="px-4 py-1 rounded-full bg-white">
          {kitchenOrders.length} Active Tickets
        </Badge>
      </div>

      {kitchenOrders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 bg-white rounded-3xl border border-dashed border-zinc-200">
          <UtensilsCrossed className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">No pending tickets</p>
          <p className="text-sm">New hospitality orders will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          <AnimatePresence mode="popLayout">
            {kitchenOrders.map((order) => (
              <motion.div key={order.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}>
                <Card className={cn('border-2 shadow-sm rounded-3xl overflow-hidden h-full flex flex-col', order.status === 'preparing' ? 'border-amber-200' : 'border-zinc-100')}>
                  <CardHeader className={cn('p-4 border-b', order.status === 'preparing' ? 'bg-amber-50/50' : 'bg-zinc-50/50')}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-lg">{order.tableNumber ? `Table ${order.tableNumber}` : `Order #${order.id.slice(-4)}`}</h3>
                        <div className="flex items-center gap-1 text-xs text-zinc-500 mt-1">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500">By {order.createdByName || 'Unknown user'}</p>
                      </div>
                      <Badge
                        className={cn(
                          'rounded-full uppercase text-[10px]',
                          order.status === 'pending' && 'bg-red-100 text-red-700 border-red-200',
                          order.status === 'preparing' && 'bg-amber-100 text-amber-700 border-amber-200',
                          order.status === 'ready' && 'bg-green-100 text-green-700 border-green-200'
                        )}
                      >
                        {order.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 flex-1 flex flex-col gap-4">
                    <div className="flex-1 space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={`${order.id}-${item.productId}-${idx}`} className="space-y-1">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex gap-3">
                              <span className="font-bold text-zinc-900 bg-zinc-100 w-6 h-6 rounded flex items-center justify-center text-xs shrink-0">{item.quantity}</span>
                              <span className="font-medium text-sm">{item.name}</span>
                            </div>
                          </div>
                          {item.notes && <p className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded italic ml-9">{item.notes}</p>}
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-zinc-100 flex gap-2">
                      {order.status === 'pending' && (
                        <Button className="w-full bg-amber-500 hover:bg-amber-600 rounded-xl h-12" onClick={() => updateStatus(order, 'preparing', 'preparing')}>
                          <Timer className="mr-2 h-4 w-4" /> Start
                        </Button>
                      )}
                      {order.status === 'preparing' && (
                        <Button className="w-full bg-green-600 hover:bg-green-700 rounded-xl h-12" onClick={() => updateStatus(order, 'ready', 'ready')}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Ready
                        </Button>
                      )}
                      {order.status === 'ready' && (
                        <Button variant="outline" className="w-full border-zinc-200 rounded-xl h-12" onClick={() => updateStatus(order, 'served', 'served')}>
                          Served
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
