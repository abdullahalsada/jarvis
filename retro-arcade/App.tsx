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

/**
 * App flow: Splash → Language (first run) → Player name (first run) → Arcade.
 * No registration anywhere: the account is silent/anonymous, and the store
 * account (Game Center / Play Games) anchors it in store builds.
 */
function Gate() {
  const { ready, username } = useAuth();
  const [langChosen, setLangChosen] = useState<boolean | null>(null);
  // Pixel font (OFL): the UI waits for it so type never visibly swaps.
  const [fontsLoaded, fontError] = useFonts({
    PressStart2P: require('./assets/fonts/PressStart2P-Regular.ttf'),
  });

  useEffect(() => {
    (async () => {
      const stored = await getStoredLanguage();
      await initI18n(stored ?? deviceLanguage());
      setLangChosen(stored !== null);
      flushScoreQueue();
    })();
  }, []);

  if (langChosen === null || !ready || (!fontsLoaded && !fontError)) return <SplashScreen />;
  if (!langChosen) return <LanguageScreen onDone={() => setLangChosen(true)} />;
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
          <Gate />
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
