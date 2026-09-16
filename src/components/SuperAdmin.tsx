import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, updateDoc, doc, getDocs, where } from 'firebase/firestore';
import { Business, UserProfile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { 
  Users, 
  Store, 
  TrendingUp, 
  CheckCircle2, 
  Clock,
  ChevronRight,
  ShieldCheck,
  Search,
  RefreshCcw,
  MoreVertical,
  Ban
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export function SuperAdmin() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubBiz = onSnapshot(collection(db, 'businesses'), (snap) => {
      setBusinesses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business)));
      setLoading(false);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setAllUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    });

    return () => {
      unsubBiz();
      unsubUsers();
    };
  }, []);

  const getClientHealth = (business: Business) => {
    if (!business.subscription) return { label: 'No Plan', color: 'bg-zinc-100 text-zinc-600' };
    
    const expiry = business.subscription.expiryDate?.seconds ? new Date(business.subscription.expiryDate.seconds * 1000) : new Date(business.subscription.expiryDate);
    const now = new Date();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (business.subscription.status === 'expired' || daysLeft <= 0) {
      return { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (daysLeft <= 5) {
      return { label: `Critical (${daysLeft}d)`, color: 'bg-orange-100 text-orange-700 border-orange-200' };
    }
    if (daysLeft <= 10) {
      return { label: `Warning (${daysLeft}d)`, color: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    return { label: 'Healthy', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  const handleUpdateSubscription = async (businessId: string, days: number) => {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);
      
      await updateDoc(doc(db, 'businesses', businessId), {
        'subscription.status': 'active',
        'subscription.expiryDate': expiryDate,
        'subscription.plan': 'pro'
      });
      toast.success(`Subscription extended by ${days} days`);
    } catch (error) {
      toast.error("Failed to update subscription");
    }
  };

  const handleAccessStatusChange = async (businessId: string, accessStatus: Business['accessStatus']) => {
    try {
      await updateDoc(doc(db, 'businesses', businessId), { accessStatus });
      toast.success(accessStatus === 'blocked' ? 'Store access blocked (Subscription cut off)' : 'Store access restored');
    } catch (error) {
      toast.error('Failed to update access status');
    }
  };

  const filteredBusinesses = businesses.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    totalClients: businesses.filter(b => !b.parentId).length,
    totalUnderclients: businesses.filter(b => b.parentId).length,
    blockedClients: businesses.filter(b => b.accessStatus === 'blocked').length,
    activeSubs: businesses.filter(b => b.subscription?.status === 'active' && b.accessStatus !== 'blocked').length,
    revenueRunRate: businesses.reduce((acc, b) => acc + (b.subscription?.plan === 'pro' && b.accessStatus !== 'blocked' ? 2000 : 0), 0)
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-indigo-600" />
            Platform Command Center
          </h1>
          <p className="text-zinc-500">Global overview of all businesses and subscriptions</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder="Search businesses..."
              className="pl-10 rounded-2xl border-zinc-200 h-12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" className="rounded-2xl h-12 border-zinc-200">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-3xl border-zinc-100 shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-50 rounded-2xl">
                <Store className="h-6 w-6 text-indigo-600" />
              </div>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100">+12%</Badge>
            </div>
            <h3 className="text-zinc-500 text-sm font-medium">Total Clients</h3>
            <p className="text-3xl font-bold text-zinc-900 mt-1">{stats.totalClients}</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-zinc-100 shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <span className="text-xs text-zinc-400">Branches</span>
            </div>
            <h3 className="text-zinc-500 text-sm font-medium">Underclients</h3>
            <p className="text-3xl font-bold text-zinc-900 mt-1">{stats.totalUnderclients}</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-zinc-100 shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-50 rounded-2xl">
                <Ban className="h-6 w-6 text-red-600" />
              </div>
              <Badge className="bg-red-50 text-red-700 border-red-100">Cut-off</Badge>
            </div>
            <h3 className="text-zinc-500 text-sm font-medium">Suspended / Blocked</h3>
            <p className="text-3xl font-bold text-zinc-900 mt-1">{stats.blockedClients}</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-zinc-100 shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-amber-50 rounded-2xl">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <span className="text-xs text-zinc-400">Monthly</span>
            </div>
            <h3 className="text-zinc-500 text-sm font-medium">Est. Revenue</h3>
            <p className="text-3xl font-bold text-zinc-900 mt-1">{stats.revenueRunRate.toLocaleString()} ден</p>
          </CardContent>
        </Card>
      </div>

      {/* Client List */}
      <Card className="rounded-3xl border-zinc-100 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-zinc-50 bg-zinc-50/30 px-8 py-6">
          <CardTitle className="text-lg">Client Directory & Subscription Watcher</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-8">Business Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBusinesses.map((b) => {
                const health = getClientHealth(b);
                const accessStatus = b.accessStatus || 'approved';
                const owner = allUsers.find(u => u.uid === b.ownerId);
                const subClients = businesses.filter(child => child.parentId === b.id);

                return (
                  <React.Fragment key={b.id}>
                    <TableRow className="group hover:bg-zinc-50/50 transition-colors">
                      <TableCell className="pl-8">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-2xl flex items-center justify-center font-bold text-white shadow-sm",
                            b.parentId ? "bg-zinc-400 scale-90" : "bg-zinc-900"
                          )}>
                            {b.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 flex items-center gap-2">
                              {b.name}
                              {b.parentId && <Badge variant="outline" className="text-[10px] py-0 h-4">Branch</Badge>}
                            </div>
                            <div className="text-xs text-zinc-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last active: {b.lastActive ? new Date(b.lastActive).toLocaleDateString() : 'Never'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize text-zinc-600">{b.type}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium text-zinc-900">{owner?.name || 'Unknown'}</div>
                          <div className="text-xs text-zinc-400">{owner?.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full px-3 py-1 font-medium capitalize",
                            accessStatus === 'approved' && "bg-emerald-100 text-emerald-700 border-emerald-200",
                            accessStatus === 'pending' && "bg-amber-100 text-amber-700 border-amber-200",
                            accessStatus === 'blocked' && "bg-red-100 text-red-700 border-red-200"
                          )}
                        >
                          {accessStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("rounded-full px-3 py-1 font-medium", health.color)}>
                          {health.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="rounded-full capitalize">
                          {b.subscription?.plan || 'free'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex justify-end gap-2">
                          {accessStatus !== 'approved' && (
                            <Button
                              size="sm"
                              className="rounded-xl h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleAccessStatusChange(b.id, 'approved')}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              Approve
                            </Button>
                          )}
                          {accessStatus !== 'blocked' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl h-9 text-xs font-bold border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => handleAccessStatusChange(b.id, 'blocked')}
                            >
                              <Ban className="mr-1 h-4 w-4" />
                              Block
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="rounded-xl h-9 text-xs font-bold border-zinc-200 hover:bg-zinc-900 hover:text-white transition-all"
                            onClick={() => handleUpdateSubscription(b.id, 30)}
                          >
                            Extend 30d
                          </Button>
                          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl">
                            <MoreVertical className="h-4 w-4 text-zinc-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {subClients.length > 0 && subClients.map(child => (
                      <TableRow key={child.id} className="bg-zinc-50/30 border-l-4 border-indigo-500">
                        <TableCell className="pl-16">
                          <div className="flex items-center gap-3">
                            <ChevronRight className="h-4 w-4 text-zinc-300" />
                            <div className="h-8 w-8 rounded-xl bg-zinc-400 flex items-center justify-center font-bold text-white text-xs">
                              {child.name.charAt(0)}
                            </div>
                            <div className="text-sm font-medium text-zinc-600">{child.name}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 capitalize">{child.type}</TableCell>
                        <TableCell colSpan={5} className="text-right pr-8">
                           <Badge variant="outline" className="text-[10px]">Managed by Parent</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
