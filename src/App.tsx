/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { auth, db } from './firebase';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { POS } from './components/POS';
import { Kitchen } from './components/Kitchen';
import { SetupBusiness } from './components/SetupBusiness';
import { Business } from './types';
import { Loader2, ShieldAlert, Store } from 'lucide-react';
import { Toaster } from 'sonner';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';

function SubscriptionBlockedGate({ business, email }: { business: Business | null; email?: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-lg border-zinc-800 bg-zinc-900 text-white shadow-2xl rounded-3xl overflow-hidden">
        <CardHeader className="space-y-4 pt-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10 text-red-500 border border-red-500/20">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-white">
              Subscription Suspended
            </CardTitle>
            <CardDescription className="text-zinc-400 text-sm">
              Access to easyPOS for this business has been closed by the platform administrator due to an unpaid subscription fee.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-8 text-sm text-zinc-300">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="font-bold text-white text-base">{business?.name || 'Your Business'}</p>
            <p className="text-zinc-400 text-xs mt-0.5">{email || 'Account'}</p>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Account Status:</span>
              <span className="font-semibold text-red-400 uppercase tracking-wide">Suspended (Unpaid)</span>
            </div>
          </div>
          <p className="text-xs text-zinc-400 text-center">
            To reactivate your POS terminal, tables, and reports, please contact easyPOS support to settle your account.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={() => window.location.reload()}
            >
              Check Status
            </Button>
            <Button
              className="flex-1 rounded-xl bg-white text-zinc-900 font-bold hover:bg-zinc-100"
              onClick={() => auth.signOut()}
            >
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AppContent() {
  const { user, profile, effectiveProfile, loading } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoading, setBusinessLoading] = useState(false);

  useEffect(() => {
    if (!profile?.businessId) {
      setBusiness(null);
      setBusinessLoading(false);
      return;
    }

    setBusinessLoading(true);
    const unsubscribeBusiness = onSnapshot(
      doc(db, 'businesses', profile.businessId),
      (snap) => {
        setBusiness(snap.exists() ? ({ id: snap.id, ...snap.data() } as Business) : null);
        setBusinessLoading(false);
      },
      () => {
        setBusiness(null);
        setBusinessLoading(false);
      }
    );

    return unsubscribeBusiness;
  }, [profile?.businessId]);

  if (loading || businessLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const isSuperAdmin = profile?.email === 'muhamedsuleyman97@gmail.com' || profile?.role === 'super_admin';

  if (isSuperAdmin) {
    return <Dashboard />;
  }

  if (!profile || (profile.role === 'owner' && !profile.businessId)) {
    return <SetupBusiness />;
  }

  if (business?.accessStatus === 'blocked') {
    return <SubscriptionBlockedGate business={business} email={profile.email} />;
  }

  const activeRole = effectiveProfile?.role || profile?.role || 'owner';

  switch (activeRole) {
    case 'owner':
    case 'admin':
    case 'manager':
    case 'cashier':
      return <Dashboard />;
    case 'waiter':
      return <POS />;
    case 'kitchen':
      return <Kitchen />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster position="top-center" richColors />
    </AuthProvider>
  );
}
