import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { EntitlementProvider } from './src/context/EntitlementContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SplashScreen } from './src/screens/SplashScreen';
import { LanguageScreen } from './src/screens/LanguageScreen';
import { UsernameScreen } from './src/screens/UsernameScreen';
import { getStoredLanguage, deviceLanguage, initI18n } from './src/i18n';
import { flushScoreQueue } from './src/services/scores';
import { initSfx } from './src/audio/sfx';
import { AssetWarmup } from './src/components/AssetWarmup';

/**
 * App flow: Splash → Language (first run) → Player name (first run) → Arcade.
 * No registration anywhere: the account is silent/anonymous, and the store
 * account (Game Center / Play Games) anchors it in store builds.
 */
/**
 * Brand-first splash: the loading screen holds for this minimum so the
 * mascot waves and the progress bar completes one full 0→100% sweep —
 * the arcade opens on the moment of completion instead of cutting the
 * bar off mid-fill. Keep in sync with the bar timing in SplashScreen.
 */
const MIN_SPLASH_MS = 2200;

function Gate() {
  const { ready, username } = useAuth();
  const [langReady, setLangReady] = useState(false);
  const [splashShown, setSplashShown] = useState(false);
  // The branded welcome gate: every launch opens on RETRO ARCADE + the
  // language drop-down (pre-set to the saved/device language), per the
  // owner's direction — internationals see their language door first.
  const [welcomed, setWelcomed] = useState(false);
  // Pixel font (OFL): the UI waits for it so type never visibly swaps.
  const [fontsLoaded, fontError] = useFonts({
    PressStart2P: require('./assets/fonts/PressStart2P-Regular.ttf'),
  });

  useEffect(() => {
    const timer = setTimeout(() => setSplashShown(true), MIN_SPLASH_MS);
    (async () => {
      const stored = await getStoredLanguage();
      await initI18n(stored ?? deviceLanguage());
      setLangReady(true);
      flushScoreQueue();
      // Pre-render the whole synth bank (jingles included) during the splash
      // so the first sound of a session never stalls a frame.
      initSfx();
    })();
    return () => clearTimeout(timer);
  }, []);

  if (!langReady || !ready || (!fontsLoaded && !fontError) || !splashShown) return <SplashScreen />;
  if (!welcomed) return <LanguageScreen onDone={() => setWelcomed(true)} />;
  if (!username) return <UsernameScreen onDone={() => {}} />;
  return (
    <EntitlementProvider>
      <RootNavigator />
    </EntitlementProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <AssetWarmup />
          <Gate />
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
