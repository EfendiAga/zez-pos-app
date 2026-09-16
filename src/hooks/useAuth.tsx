import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { UserProfile } from '../types';
import { auth } from '../lib/firebase';
import { db } from '../lib/db';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  activeStaff: UserProfile | null;
  effectiveProfile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
  setActiveStaff: (s: UserProfile | null) => void;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  activeStaff: null,
  effectiveProfile: null,
  setProfile: () => {},
  setActiveStaff: () => {},
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeStaff, setActiveStaff] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setActiveStaff(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const isTrustedSuperAdmin = firebaseUser.email?.toLowerCase() === 'muhamedsuleyman97@gmail.com';

        if (isTrustedSuperAdmin) {
          const superAdminProfile: UserProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'Super Admin',
            email: firebaseUser.email || 'muhamedsuleyman97@gmail.com',
            role: 'super_admin',
            businessId: '',
            status: 'active',
          };
          setProfile(superAdminProfile);
        } else {
          let profileDoc = await db.users.get(firebaseUser.uid);

          if (!profileDoc) {
            // Auto-heal missing owner profile so user is never locked out
            const newOwner: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'Owner',
              email: firebaseUser.email || '',
              role: 'owner',
              businessId: '',
              status: 'active',
            };
            try {
              await db.users.add(newOwner);
            } catch (err) {
              console.warn('Could not write profile to Firestore yet:', err);
            }
            profileDoc = newOwner;
          }

          if (profileDoc?.status === 'disabled') {
            await signOut(auth);
            setUser(null);
            setProfile(null);
            setActiveStaff(null);
          } else {
            setProfile({
              ...profileDoc,
              role: profileDoc.role === ('admin' as any) ? 'manager' : profileDoc.role,
            });
          }
        }
      } catch (err) {
        console.error('Auth init failed:', err);
        // Fallback default so user is not stuck on a blank screen
        if (firebaseUser.email?.toLowerCase() === 'muhamedsuleyman97@gmail.com') {
          setProfile({
            uid: firebaseUser.uid,
            name: 'Super Admin',
            email: firebaseUser.email,
            role: 'super_admin',
            businessId: '',
            status: 'active',
          });
        } else {
          setProfile({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'Owner',
            email: firebaseUser.email || '',
            role: 'owner',
            businessId: '',
            status: 'active',
          });
        }
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setActiveStaff(null);
  };

  const effectiveProfile = activeStaff || profile;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        activeStaff,
        effectiveProfile,
        setProfile,
        setActiveStaff,
        loading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
