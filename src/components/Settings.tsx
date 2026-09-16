import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { Business } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Building2, 
  Settings as SettingsIcon, 
  Bell, 
  Shield, 
  Printer, 
  Globe,
  Save,
  CheckCircle2
} from 'lucide-react';

import { toast } from 'sonner';

export function Settings() {
  const { profile } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!profile?.businessId) return;
    const unsub = onSnapshot(doc(db, 'businesses', profile.businessId), (snap) => {
      if (snap.exists()) setBusiness({ id: snap.id, ...snap.data() } as Business);
    });
    return unsub;
  }, [profile?.businessId]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !business) return;

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'businesses', profile.businessId), {
        name: business.name,
        type: business.type,
        settings: business.settings || {}
      });
      toast.success('Settings updated successfully');
    } catch (error: any) {
      console.error("Update failed:", error);
      toast.error(`Failed to update settings: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!business) return null;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Settings / Подесувања</h2>
          <p className="text-zinc-500">Manage your business configuration</p>
        </div>
      </div>

      <form onSubmit={handleUpdate} className="space-y-6">
        {/* Business Profile */}
        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-100 rounded-xl">
                <Building2 className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Business Profile</CardTitle>
                <CardDescription>Basic information about your establishment</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input 
                  value={business.name} 
                  onChange={(e) => setBusiness({...business, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Business Type</Label>
                <Select 
                  value={business.type} 
                  onValueChange={(v: any) => setBusiness({...business, type: v})}
                >
                  <SelectTrigger className="rounded-xl border-zinc-200">
                    <SelectValue placeholder="Select business type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="market">Market / Маркет</SelectItem>
                    <SelectItem value="coffee">Coffee Shop / Кафуле</SelectItem>
                    <SelectItem value="restaurant">Restaurant / Ресторан</SelectItem>
                    <SelectItem value="bakery">Bakery / Пекара</SelectItem>
                    <SelectItem value="pastry">Pastry Shop / Слаткарница</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={business.currency} disabled className="bg-zinc-50" />
              </div>
              <div className="space-y-2">
                <Label>Default Tax Rate (%)</Label>
                <Input value={business.taxRate} disabled className="bg-zinc-50" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operational Settings */}
        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-100 rounded-xl">
                <SettingsIcon className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Operational Settings</CardTitle>
                <CardDescription>Configure how your POS behaves</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Table Management</Label>
                <p className="text-xs text-zinc-500">Enable table map and seating for orders</p>
              </div>
              <Switch 
                checked={business.settings?.hasTables} 
                onCheckedChange={(checked) => setBusiness({
                  ...business, 
                  settings: { ...business.settings, hasTables: checked }
                })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Barcode Scanning</Label>
                <p className="text-xs text-zinc-500">Enable barcode input in the POS search bar</p>
              </div>
              <Switch 
                checked={business.settings?.useBarcodes} 
                onCheckedChange={(checked) => setBusiness({
                  ...business, 
                  settings: { ...business.settings, useBarcodes: checked }
                })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Fiscal Printer Config */}
        <Card className="border-zinc-200 shadow-sm rounded-3xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-100 rounded-xl">
                <Printer className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Fiscal Printer</CardTitle>
                <CardDescription>Configure your certified hardware connection</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Printer IP Address / Local URL</Label>
              <Input placeholder="e.g. http://localhost:8080" />
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                Status: <span className="text-green-600">Connected</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button 
            type="submit" 
            className="bg-zinc-900 rounded-xl px-8 h-12"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : (
              <>
                <Save className="mr-2 h-4 w-4" /> Save Settings
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
