import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { initPurchases, hasFullArcade } from '../services/purchases';

interface EntitlementState {
  /** True when the $4.99 unlock (entitlement `full_arcade`) is owned. */
  unlocked: boolean;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementState | undefined>(undefined);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [unlocked, setUnlocked] = useState(false);

  const refresh = useCallback(async () => {
    setUnlocked(await hasFullArcade());
  }, []);

  useEffect(() => {
    // Tie the RevenueCat identity to the Supabase user so the entitlement
    // follows the account across devices.
    initPurchases(session?.user?.id ?? null).then(refresh);
  }, [session?.user?.id, refresh]);

  return (
    <EntitlementContext.Provider value={{ unlocked, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementState {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used inside EntitlementProvider');
  return ctx;
}
