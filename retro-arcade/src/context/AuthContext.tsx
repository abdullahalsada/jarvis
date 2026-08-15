import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getPlatformIdentity } from '../services/identity';

/**
 * No-registration identity (owner's design): a silent anonymous account plus
 * a chosen unique player name. No email, no password, ever. The store
 * account (Game Center / Play Games) becomes the cross-device anchor once
 * the native identity module lands in dev builds — see services/identity.ts.
 */
const USERNAME_KEY = 'retroarcade.username';

export type ClaimResult = 'ok' | 'taken' | 'invalid' | 'network';

interface AuthState {
  /** Storage checked and (when configured) session ensured. */
  ready: boolean;
  session: Session | null;
  /** The player's chosen name, or null before first-run setup. */
  username: string | null;
  /** True when running without a configured backend (local-only play). */
  guestMode: boolean;
  claimUsername: (name: string) => Promise<ClaimResult>;
  deleteAccount: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(USERNAME_KEY);
      if (stored) setUsername(stored);

      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        let current = data.session;
        if (!current) {
          // Invisible to the player: no form, no email — just an account.
          const { data: anon } = await supabase.auth.signInAnonymously();
          current = anon.session ?? null;
        }
        setSession(current);

        // Dev builds: link the store-account identity so the profile (and
        // scores) follow the player across devices. No-op in Expo Go.
        const identity = await getPlatformIdentity();
        if (current && identity) {
          await supabase
            .from('profiles')
            .update({ platform: identity.platform, platform_player_id: identity.playerId })
            .eq('id', current.user.id);
        }

        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
        void sub;
      }
      setReady(true);
    })();
  }, []);

  const claimUsername = async (name: string): Promise<ClaimResult> => {
    if (!USERNAME_RE.test(name)) return 'invalid';
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('claim_username', { p_username: name });
      if (error) return 'network';
      if (data !== 'ok') return data as ClaimResult;
    }
    await AsyncStorage.setItem(USERNAME_KEY, name);
    setUsername(name);
    return 'ok';
  };

  /**
   * Store-required account deletion: removes the anonymous auth user,
   * profile, and scores (cascade), plus the local name.
   */
  const deleteAccount = async () => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('delete_account');
      if (error) return { error: error.message };
      await supabase.auth.signOut();
    }
    await AsyncStorage.removeItem(USERNAME_KEY);
    setUsername(null);
    return {};
  };

  return (
    <AuthContext.Provider
      value={{
        ready,
        session,
        username,
        guestMode: !isSupabaseConfigured,
        claimUsername,
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
