import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** True when running without a configured backend (local dev / offline demo). */
  guestMode: boolean;
  register: (email: string, password: string) => Promise<{ error?: string }>;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const register = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? { error: error.message } : {};
  };

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  /**
   * Store-required account deletion (Apple 5.1.1(v), Google User Data policy).
   * Calls the `delete_account` SECURITY DEFINER function (supabase/schema.sql),
   * which removes the auth user, profile, and scores in one transaction.
   */
  const deleteAccount = async () => {
    const { error } = await supabase.rpc('delete_account');
    if (error) return { error: error.message };
    await supabase.auth.signOut();
    return {};
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        guestMode: !isSupabaseConfigured,
        register,
        login,
        logout,
        deleteAccount,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
