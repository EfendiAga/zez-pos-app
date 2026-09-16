import React, { useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { ArrowRight, ChevronLeft, Loader2, Lock, Mail, Store, Ticket, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/db';
import { StaffInvite, UserProfile } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

type LoginMode = 'signin' | 'signup' | 'invite';

export function Login() {
  const { setProfile } = useAuth();
  const [mode, setMode] = useState<LoginMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [loading, setLoading] = useState(false);

  const ensureProfile = async (uid: string, emailValue: string, nameValue: string): Promise<UserProfile> => {
    const isTrustedSuperAdmin = emailValue?.toLowerCase() === 'muhamedsuleyman97@gmail.com';
    if (isTrustedSuperAdmin) {
      return {
        uid,
        name: nameValue || 'Super Admin',
        email: emailValue,
        role: 'super_admin',
        businessId: '',
        status: 'active',
      };
    }

    try {
      const existingUser = await db.users.get(uid);
      if (existingUser) return existingUser;
    } catch (e) {
      console.warn('Could not read existing profile, creating fallback:', e);
    }

    const newProfile: UserProfile = {
      uid,
      name: nameValue || 'Owner',
      email: emailValue,
      role: 'owner',
      businessId: '',
      status: 'active',
    };

    try {
      await db.users.add(newProfile);
    } catch (e) {
      console.warn('Could not write profile to Firestore:', e);
    }

    return newProfile;
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const normalizedEmail = user.email?.toLowerCase() || '';

      const profile = await ensureProfile(
        user.uid,
        normalizedEmail,
        user.displayName || 'Owner'
      );

      if (profile.status === 'disabled') {
        await signOut(auth);
        toast.error('This account has been disabled');
        return;
      }

      setProfile(profile);
      toast.success(
        profile.role === 'super_admin'
          ? 'Signed in as Platform Super Admin'
          : `Signed in successfully`
      );
    } catch (error: any) {
      console.error('Google sign in error:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error(error.message || 'Google sign in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      toast.error('Please enter your email and password');
      return;
    }

    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const profile = await ensureProfile(
        result.user.uid,
        normalizedEmail,
        result.user.displayName || normalizedEmail.split('@')[0]
      );

      if (profile.status === 'disabled') {
        await signOut(auth);
        toast.error('This account has been disabled');
        return;
      }

      setProfile(profile);
      toast.success(
        profile.role === 'super_admin'
          ? 'Signed in as Platform Super Admin'
          : 'Signed in successfully'
      );
    } catch (error: any) {
      console.error('Email sign in error:', error);
      toast.error(error.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = signupEmail.trim().toLowerCase();

    if (!signupName.trim() || !normalizedEmail || !signupPassword) {
      toast.error('Please fill in all signup fields');
      return;
    }

    if (signupPassword.length < 6) {
      toast.error('Use at least 6 characters for the password');
      return;
    }

    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, normalizedEmail, signupPassword);
      await updateProfile(result.user, { displayName: signupName.trim() });
      const profile = await ensureProfile(result.user.uid, normalizedEmail, signupName.trim());
      setProfile(profile);
      toast.success('Account created! Continue with quick store setup.');
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error(error.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !inviteCode.trim() || !invitePassword) {
      toast.error('Fill in your invite details');
      return;
    }

    if (invitePassword.length < 6) {
      toast.error('Use at least 6 characters for the password');
      return;
    }

    setLoading(true);
    try {
      const allInvites = (await db.staffInvites.toArray()) as StaffInvite[];
      const invite = allInvites.find(
        (entry) =>
          entry.status === 'invited'
          && entry.email.toLowerCase() === normalizedEmail
          && entry.inviteCode.toUpperCase() === inviteCode.trim().toUpperCase()
      );

      if (!invite) {
        toast.error('Invite not found or already used');
        return;
      }

      const result = await createUserWithEmailAndPassword(auth, normalizedEmail, invitePassword);
      const displayName = invite.name || inviteName.trim() || normalizedEmail.split('@')[0];
      await updateProfile(result.user, { displayName });

      const createdProfile: UserProfile = {
        uid: result.user.uid,
        name: displayName,
        email: normalizedEmail,
        role: invite.role === ('admin' as any) ? 'manager' : invite.role,
        businessId: invite.businessId,
        status: 'active',
        ...(invite.pin ? { pin: invite.pin } : {}),
      };

      await db.users.add(createdProfile);
      await db.staffInvites.update(invite.id, {
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        acceptedByUid: result.user.uid,
      });

      setProfile(createdProfile);
      toast.success('Invite accepted! You are logged in.');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Invite setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error('Enter your email first');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      toast.success('Password reset email sent');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Password reset failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 bg-white rounded-3xl mb-4 shadow-2xl">
            <Store className="h-8 w-8 text-zinc-900" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">easyPOS</h1>
          <p className="text-zinc-400 text-sm mt-1">Macedonia's modern point of sale</p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'signin' && (
            <motion.div
              key="signin"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full h-12 rounded-2xl border-zinc-200 font-semibold hover:bg-zinc-50 flex items-center justify-center gap-3 text-zinc-800 shadow-sm"
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </Button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-zinc-200 w-full" />
                <span className="bg-white px-3 text-xs uppercase tracking-wider font-semibold text-zinc-400 absolute">
                  or with email
                </span>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-3.5 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="email"
                      placeholder="owner@business.mk"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-zinc-700">Password</Label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs text-blue-600 font-semibold hover:underline"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white shadow-lg"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Sign In
                </Button>
              </form>

              <div className="pt-3 border-t border-zinc-100 flex flex-col items-center gap-2">
                <p className="text-xs text-zinc-500">
                  New business?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-zinc-900 font-bold hover:underline"
                  >
                    Create store account
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => setMode('invite')}
                  className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                >
                  <Ticket className="h-3 w-3" /> Have a staff invite code?
                </button>
              </div>
            </motion.div>
          )}

          {mode === 'signup' && (
            <motion.div
              key="signup"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-3xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="text-zinc-400 hover:text-zinc-700"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-black text-zinc-900">Create Store Account</h2>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full h-12 rounded-2xl border-zinc-200 font-semibold hover:bg-zinc-50 flex items-center justify-center gap-3 text-zinc-800 shadow-sm mb-4"
              >
                <GoogleIcon />
                <span>Sign up with Google</span>
              </Button>

              <div className="relative flex items-center justify-center mb-4">
                <div className="border-t border-zinc-200 w-full" />
                <span className="bg-white px-3 text-xs uppercase tracking-wider font-semibold text-zinc-400 absolute">
                  or with email
                </span>
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      placeholder="Alex Owner"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Business Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      placeholder="owner@business.mk"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      placeholder="At least 6 characters"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white shadow-lg"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Create Account
                </Button>
              </form>

              <div className="pt-4 mt-4 border-t border-zinc-100 text-center">
                <p className="text-xs text-zinc-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="text-zinc-900 font-bold hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </motion.div>
          )}

          {mode === 'invite' && (
            <motion.div
              key="invite"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-3xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="text-zinc-400 hover:text-zinc-700"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-black text-zinc-900">Accept Staff Invite</h2>
              </div>

              <form onSubmit={handleAcceptInvite} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Your Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      placeholder="Optional if invite has name"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Invite Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      placeholder="staff@shop.mk"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Invite Code</Label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className="pl-9 rounded-xl h-11 border-zinc-200 uppercase tracking-[0.3em]"
                      placeholder="ABC123"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-zinc-700">Set Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      type="password"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      className="pl-9 rounded-xl h-11 border-zinc-200"
                      placeholder="At least 6 characters"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white shadow-lg"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Activate Staff Account
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
