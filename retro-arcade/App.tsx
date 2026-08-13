import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { EntitlementProvider } from './src/context/EntitlementContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SplashScreen } from './src/screens/SplashScreen';
import { LanguageScreen } from './src/screens/LanguageScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { getStoredLanguage, deviceLanguage, initI18n } from './src/i18n';
import { flushScoreQueue } from './src/services/scores';

/**
 * App flow: Splash → Language (first run only) → Register/Login → Arcade.
 * Guest mode (no backend configured) skips auth so local play always works.
 */
function Gate() {
  const { session, loading, guestMode } = useAuth();
  const [langChosen, setLangChosen] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const stored = await getStoredLanguage();
      await initI18n(stored ?? deviceLanguage());
      setLangChosen(stored !== null);
      flushScoreQueue();
    })();
  }, []);

  if (langChosen === null || loading) return <SplashScreen />;
  if (!langChosen) return <LanguageScreen onDone={() => setLangChosen(true)} />;
  if (!guestMode && !session) return <AuthScreen />;
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
