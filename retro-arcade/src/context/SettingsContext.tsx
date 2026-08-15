import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  scanlines: boolean;
}

const DEFAULTS: Settings = { sound: true, haptics: true, scanlines: true };
const STORAGE_KEY = 'retroarcade.settings';

interface SettingsState extends Settings {
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsState | undefined>(undefined);

/** Module-level mirror so non-React modules (sfx, haptics) can read settings. */
let current: Settings = { ...DEFAULTS };
export function getSettings(): Settings {
  return current;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        const loaded = { ...DEFAULTS, ...JSON.parse(raw) };
        setSettings(loaded);
        current = loaded;
      }
    });
  }, []);

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      current = next;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ ...settings, setSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
