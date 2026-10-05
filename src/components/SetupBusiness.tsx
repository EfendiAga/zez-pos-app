import React, { useState } from 'react';
import { db, generateId } from '../lib/db';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { UserProfile } from '../types';
import { toast } from 'sonner';

import { cn } from '../lib/utils';
import { backupService } from '../lib/backupService';

export function SetupBusiness() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinDigits, setPinDigits] = useState<4 | 6>(4);
  const [loading, setLoading] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (pin.length > 0 && pin.length !== pinDigits) {
      toast.error(`PIN must be exactly ${pinDigits} digits if provided.`);
      return;
    }

    setLoading(true);
    try {
      const ownerId = generateId();
      const businessId = generateId();

      // 1. Create Business
      await db.businesses.add({
        id: businessId,
        name: name.trim(),
        type: 'market',
        accessStatus: 'approved',
        taxRate: 18, // Default MKD DDV
        currency: 'MKD',
        ownerId: ownerId,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        subscription: {
          plan: 'enterprise',
          status: 'active',
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Local license
          autoRenew: true,
        },
      });

      // 2. Create Owner Profile
      const updatedProfile: UserProfile = {
        uid: ownerId,
        name: 'Store Owner',
        email: 'local@owner',
        role: 'owner',
        businessId: businessId,
        status: 'active',
        pin: pin || undefined,
      };

      await db.users.add(updatedProfile);

      // 3. Add default market/store categories
      const categories = ['Пијалоци / Drinks', 'Прехранбени / Groceries', 'Млечни / Dairy', 'Снакси / Snacks', 'Останато / Other'];
      for (const cat of categories) {
        await db.categories.add({
          name: cat,
          businessId: businessId,
        });
      }

      toast.success('ZEZ-POS setup complete!');
      
      // Reload window to trigger useAuth hook re-evaluation
      window.location.reload();
    } catch (error: any) {
      console.error('Setup failed:', error);
      toast.error(error.message || 'Failed to setup business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900 text-white shadow-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-16 w-16 bg-white rounded-2xl p-1 shadow-lg border border-zinc-700 overflow-hidden">
              <img src="./logo.png" alt="ZEZ" className="h-full w-full object-contain" />
            </div>
          </div>
          <CardTitle className="text-2xl font-black">Welcome to ZEZ-POS</CardTitle>
          <CardDescription className="text-zinc-400">Let's set up your store.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-zinc-200">Store / Bakery Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. ZEZ Bakery" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pin" className="text-zinc-200">Owner PIN (Optional)</Label>
                <div className="flex items-center bg-zinc-800 p-0.5 rounded-lg border border-zinc-700 text-xs">
                  <button
                    type="button"
                    onClick={() => { setPinDigits(4); setPin(''); }}
                    className={cn(
                      "px-2 py-0.5 rounded-md font-bold transition-all",
                      pinDigits === 4 ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    4 Digits
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPinDigits(6); setPin(''); }}
                    className={cn(
                      "px-2 py-0.5 rounded-md font-bold transition-all",
                      pinDigits === 6 ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    6 Digits
                  </button>
                </div>
              </div>
              <Input 
                id="pin" 
                type="password"
                inputMode="numeric"
                maxLength={pinDigits}
                placeholder={pinDigits === 6 ? "••••••" : "••••"} 
                value={pin} 
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, pinDigits))} 
                className="bg-zinc-950 border-zinc-800 text-white tracking-widest text-center text-lg"
              />
            </div>
            <Button type="submit" className="w-full bg-white text-zinc-900 font-bold hover:bg-zinc-200" disabled={loading}>
              {loading ? 'Initializing...' : 'Start using POS'}
            </Button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-900 px-2 text-zinc-500 font-semibold">или / or</span>
              </div>
            </div>

            <input
              type="file"
              id="setup-restore-file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLoading(true);
                toast.loading('Restoring database...', { id: 'setup-restore' });
                try {
                  const res = await backupService.importBackup(file);
                  if (res.success) {
                    toast.success('Database restored successfully! Reloading...', { id: 'setup-restore' });
                    setTimeout(() => window.location.reload(), 1000);
                  } else {
                    toast.error(res.message, { id: 'setup-restore' });
                    setLoading(false);
                  }
                } catch (err: any) {
                  toast.error(err.message || 'Failed to restore backup', { id: 'setup-restore' });
                  setLoading(false);
                }
              }}
            />

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => document.getElementById('setup-restore-file')?.click()}
              className="w-full border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800 hover:text-white text-zinc-300 font-bold text-xs h-11 rounded-xl"
            >
              Врати од Резервна Копија (.json) / Restore Backup
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
