import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { HomeScreen } from '../screens/HomeScreen';
import { GameScreen } from '../screens/GameScreen';
import { PurchaseScreen } from '../screens/PurchaseScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { LanguageScreen } from '../screens/LanguageScreen';
import { RecordsScreen } from '../screens/RecordsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgRaised,
    text: colors.text,
    primary: colors.neonGreen,
    border: colors.border,
  },
};

/** Minimal menus: one stack, headers hidden (each screen draws its own big UI). */
export function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Game" component={GameScreen} />
        <Stack.Screen name="Purchase" component={PurchaseScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Records" component={RecordsScreen} />
        <Stack.Screen name="Language">
          {({ navigation }) => <LanguageScreen onDone={() => navigation.goBack()} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
