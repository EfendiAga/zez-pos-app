import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { doc, setDoc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useAuth } from '../hooks/useAuth';
import { UserProfile } from '../types';
import { toast } from 'sonner';
export function SetupBusiness() {
  const { user, setProfile } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<'market' | 'coffee' | 'pastry' | 'bakery' | 'restaurant'>('market');
  const [loading, setLoading] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;

    setLoading(true);
    try {
      // 1. Create Business with approved trial status
      const businessRef = await addDoc(collection(db, 'businesses'), {
        name: name.trim(),
        type,
        accessStatus: 'approved',
        taxRate: 18, // Default MKD DDV
        currency: 'MKD',
        ownerId: user.uid,
        ownerUserId: user.uid,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        subscription: {
          plan: 'trial',
          status: 'active',
          expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
          autoRenew: false,
        },
      });

      // 2. Create / Update User Profile
      const updatedProfile: UserProfile = {
        uid: user.uid,
        name: user.displayName || 'Owner',
        email: user.email || '',
        role: 'owner',
        businessId: businessRef.id,
        status: 'active',
      };

      await setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
      setProfile(updatedProfile);

      // 3. Add default categories to the root categories collection
      const categoryMap: Record<string, string[]> = {
        market: ['Groceries', 'Dairy', 'Beverages', 'Snacks', 'Household'],
        coffee: ['Hot Coffee', 'Cold Coffee', 'Teas', 'Pastries', 'Sandwiches'],
        pastry: ['Cakes', 'Cookies', 'Traditional', 'Drinks'],
        bakery: ['Bread', 'Burek', 'Sweet Pastries', 'Yogurt'],
        restaurant: ['Appetizers', 'Main Course', 'Salads', 'Desserts', 'Drinks'],
      };

      const categories = categoryMap[type] || ['General'];
      for (const cat of categories) {
        try {
          await addDoc(collection(db, 'categories'), {
            name: cat,
            businessId: businessRef.id,
          });
        } catch (catErr) {
          console.warn('Could not seed category:', catErr);
        }
      }

      toast.success('Business setup complete! Welcome to easyPOS.');
    } catch (error: any) {
      console.error('Setup failed:', error);
      toast.error(error.message || 'Failed to setup business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md border-zinc-200 shadow-lg">
        <CardHeader>
          <CardTitle>Setup Your Business</CardTitle>
          <CardDescription>Enter your business details to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Business Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. Skopje Market" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Business Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market">Market / Mini Market</SelectItem>
                  <SelectItem value="coffee">Coffee Place</SelectItem>
                  <SelectItem value="pastry">Pastry Shop</SelectItem>
                  <SelectItem value="bakery">Bakery</SelectItem>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full bg-zinc-900" disabled={loading}>
              {loading ? 'Setting up...' : 'Create Business'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
