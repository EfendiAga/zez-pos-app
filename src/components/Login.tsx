import React, { useState, useEffect } from 'react';
import { Store, User, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/db';
import { UserProfile } from '../types';
import { Button } from './ui/button';

export function Login() {
  const { setProfile, setActiveStaff } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.users.toArray().then((allUsers: UserProfile[]) => {
      setUsers(allUsers);
      setLoading(false);
    });
  }, []);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    // If no pin is set for this user, allow login without pin
    if (!selectedUser.pin || selectedUser.pin === pin) {
      localStorage.setItem('activeUserId', selectedUser.uid);
      
      if (selectedUser.role === 'owner') {
        setProfile(selectedUser);
        setActiveStaff(null);
      } else {
        const owner = users.find(u => u.role === 'owner');
        if (owner) setProfile(owner);
        setActiveStaff(selectedUser);
      }
      toast.success(`Welcome back, ${selectedUser.name}!`);
    } else {
      toast.error('Incorrect PIN');
      setPin('');
    }
  };

  const handleNumpad = (num: string) => {
    const targetLength = selectedUser?.pin?.length || 6;
    if (pin.length < targetLength) setPin(p => p + num);
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="animate-spin text-white h-8 w-8" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 bg-white rounded-3xl mb-4 shadow-2xl">
            <Store className="h-8 w-8 text-zinc-900" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">easyPOS</h1>
          <p className="text-zinc-400 text-sm mt-1">Bakery Point of Sale</p>
        </div>

        <AnimatePresence mode="wait">
          {!selectedUser ? (
            <motion.div
              key="select-user"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <h2 className="text-xl font-bold text-center text-zinc-900 mb-4">Select User</h2>
              <div className="space-y-2">
                {users.map(user => (
                  <Button
                    key={user.uid}
                    variant="outline"
                    className="w-full h-14 justify-start px-4 text-lg font-medium"
                    onClick={() => setSelectedUser(user)}
                  >
                    <User className="mr-3 h-5 w-5 text-zinc-500" />
                    {user.name} 
                    <span className="ml-auto text-xs uppercase text-zinc-400">{user.role}</span>
                  </Button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="enter-pin"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-3xl p-6 shadow-2xl"
            >
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-zinc-900">{selectedUser.name}</h2>
                <p className="text-sm text-zinc-500">Enter your 4-digit PIN</p>
              </div>

              <form onSubmit={handlePinSubmit} className="space-y-6">
                  <div className="flex justify-center gap-4 mb-8">
                    {[...Array(selectedUser.pin?.length || 6)].map((_, i) => (
                      <div key={i} className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-zinc-900' : 'bg-zinc-200'}`} />
                    ))}
                  </div>

                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <Button
                      key={num}
                      type="button"
                      variant="outline"
                      className="h-16 text-2xl font-bold rounded-2xl"
                      onClick={() => handleNumpad(num.toString())}
                    >
                      {num}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-16 text-zinc-500 rounded-2xl"
                    onClick={() => setSelectedUser(null)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-16 text-2xl font-bold rounded-2xl"
                    onClick={() => handleNumpad('0')}
                  >
                    0
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-16 text-red-500 rounded-2xl"
                    onClick={() => setPin(p => p.slice(0, -1))}
                  >
                    Clear
                  </Button>
                </div>

                <Button
                  type="submit"
                  className="w-full h-14 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-lg"
                  disabled={pin.length < (selectedUser.pin?.length || 6) && !!selectedUser.pin}
                >
                  Login
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
