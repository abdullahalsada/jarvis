import React, { useEffect } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { GameShell } from '../games/engine/GameShell';
import { gameById, gameColor } from '../games/registry';
import { useEntitlement } from '../context/EntitlementContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

export function GameScreen({ route, navigation }: Props) {
  const { gameId } = route.params;
  const { unlocked } = useEntitlement();
  const game = gameById(gameId);

  // Entitlement is checked again here so deep links can't bypass the lock.
  const blocked = !game || (!game.free && !unlocked);
  useEffect(() => {
    if (blocked) navigation.replace('Purchase');
  }, [blocked, navigation]);
  if (blocked || !game) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <GameShell
      gameId={game.id}
      color={gameColor(game)}
      showLives={game.showLives}
      onQuit={() => navigation.goBack()}>
      {(api) => game.render(api)}
    </GameShell>
  );
}
