import React, { useState } from 'react';
import { Plus, Trash2, Users, Utensils, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { nextTableNumber } from '../lib/businessData';
import { db, useLiveQuery } from '../lib/db';
import { Table as TableType } from '../types';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface TableMapProps {
  onSelectTable: (table: TableType) => void;
}

export function TableMap({ onSelectTable }: TableMapProps) {
  const { profile } = useAuth();
  const canManageTables = profile?.role === 'owner' || profile?.role === 'manager';
  const tables = ((useLiveQuery(
    () => (profile?.businessId ? db.diningTables.where('businessId').equals(profile.businessId).toArray() : []),
    [profile?.businessId]
  ) || []) as TableType[]).sort((a, b) => Number(a.number) - Number(b.number));
  const [tableToDelete, setTableToDelete] = useState<{ id: string; number: string } | null>(null);

  const handleAddTable = async () => {
    if (!profile?.businessId) return;
    try {
      const nextNumber = nextTableNumber(tables.map((table) => table.number));
      await db.diningTables.add({
        id: `table-${profile.businessId}-${Date.now()}`,
        businessId: profile.businessId,
        number: nextNumber,
        status: 'available',
      });
      toast.success(`Table ${nextNumber} added`);
    } catch (error) {
      console.error('Failed to add table:', error);
      toast.error('Failed to add table');
    }
  };

  const handleDeleteTable = async () => {
    if (!tableToDelete) return;
    try {
      await db.diningTables.delete(tableToDelete.id);
      toast.success(`Table ${tableToDelete.number} removed`);
      setTableToDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to remove table');
    }
  };

  return (
    <div className="space-y-6">
      {tables.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-zinc-200">
          <Utensils className="h-12 w-12 text-zinc-300 mb-4" />
          <h3 className="text-xl font-bold text-zinc-900">No tables yet</h3>
          <p className="text-zinc-500 mb-6 text-center max-w-xs">
            Add only the tables this business really uses. They will stay saved for the next session.
          </p>
          <Button onClick={handleAddTable} className="bg-zinc-900 rounded-xl px-8" disabled={!canManageTables}>
            <Plus className="mr-2 h-4 w-4" /> Add Table
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-6">
        {tables.map((table) => (
          <Card
            key={table.id}
            className={cn(
              'group cursor-pointer transition-all active:scale-95 border-2 hover:shadow-lg rounded-3xl overflow-hidden relative',
              table.status === 'occupied' ? 'border-amber-200 bg-amber-50/30' : 'border-zinc-100 bg-white hover:border-zinc-900'
            )}
            onClick={() => onSelectTable(table)}
          >
            {canManageTables && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTableToDelete({ id: table.id, number: table.number });
                }}
                className="absolute top-2 right-2 p-1.5 bg-white border border-zinc-100 rounded-full text-zinc-300 hover:text-red-500 hover:border-red-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10"
              >
                <X className="h-3 w-3" />
              </button>
            )}

            <CardContent className="p-6 flex flex-col items-center gap-4">
              <div className={cn('p-4 rounded-2xl', table.status === 'occupied' ? 'bg-amber-100' : 'bg-zinc-100')}>
                <Utensils className={cn('h-8 w-8', table.status === 'occupied' ? 'text-amber-600' : 'text-zinc-400')} />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-zinc-900">Table {table.number}</h3>
                <Badge
                  variant="outline"
                  className={cn(
                    'mt-2 rounded-full',
                    table.status === 'occupied' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'text-zinc-500'
                  )}
                >
                  {table.status}
                </Badge>
              </div>
              {table.status === 'occupied' && (
                <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <Users className="h-3 w-3" />
                  <span>Active Order</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <Card
          className={cn(
            'transition-all active:scale-95 border-2 border-dashed rounded-3xl overflow-hidden flex items-center justify-center',
            canManageTables
              ? 'cursor-pointer border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-400'
              : 'cursor-not-allowed border-zinc-100 bg-zinc-50 opacity-50'
          )}
          onClick={canManageTables ? handleAddTable : undefined}
        >
          <CardContent className="p-6 flex flex-col items-center gap-2">
            <div className="p-3 bg-white rounded-2xl shadow-sm">
              <Plus className="h-6 w-6 text-zinc-600" />
            </div>
            <span className="text-sm font-bold text-zinc-600">Add Table</span>
          </CardContent>
        </Card>
      </div>

      {tableToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <CardContent className="p-8 text-center">
              <div className="h-16 w-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Remove Table {tableToDelete.number}?</h3>
              <p className="text-zinc-500 mb-8">This action cannot be undone.</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="rounded-xl h-12" onClick={() => setTableToDelete(null)}>
                  Cancel
                </Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-12" onClick={handleDeleteTable}>
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
