import React, { useState, useEffect, createContext, useContext } from 'react';
import { UserProfile } from '../types';
import { db } from '../lib/db';

interface AuthContextType {
  profile: UserProfile | null;
  activeStaff: UserProfile | null;
  effectiveProfile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
  setActiveStaff: (s: UserProfile | null) => void;
  loading: boolean;
  logout: () => Promise<void>;
  hasOwnerAccount: boolean;
}

const AuthContext = createContext<AuthContextType>({
  profile: null,
  activeStaff: null,
  effectiveProfile: null,
  setProfile: () => {},
  setActiveStaff: () => {},
  loading: true,
  logout: async () => {},
  hasOwnerAccount: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeStaff, setActiveStaff] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOwnerAccount, setHasOwnerAccount] = useState(false);

  useEffect(() => {
    const initLocalAuth = async () => {
      try {
        const users = await db.users.where('role').equals('owner').toArray();
        if (users && users.length > 0) {
          setHasOwnerAccount(true);
          
          // Check if there's a saved session
          const savedUid = localStorage.getItem('activeUserId');
          if (savedUid) {
            const savedUser = await db.users.get(savedUid);
            if (savedUser) {
              if (savedUser.role === 'owner') {
                setProfile(savedUser);
              } else {
                setProfile(users[0]); // Set owner as base
                setActiveStaff(savedUser);
              }
            }
          }
        } else {
          setHasOwnerAccount(false);
        }
      } catch (err) {
        console.error('Failed to init local auth:', err);
      } finally {
        setLoading(false);
      }
    };
    
    initLocalAuth();
  }, []);

  const logout = async () => {
    localStorage.removeItem('activeUserId');
    setProfile(null);
    setActiveStaff(null);
  };

  const effectiveProfile = activeStaff || profile;

  return (
    <AuthContext.Provider
      value={{
        profile,
        activeStaff,
        effectiveProfile,
        setProfile,
        setActiveStaff,
        loading,
        logout,
        hasOwnerAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
