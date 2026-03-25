import { useState } from 'react';
import { Lobby } from './components/Lobby';
import { WaitingRoom } from './components/WaitingRoom';
import { GameBoard } from './components/GameBoard';
import type { GameState } from './types/game';

type AppState = 'lobby' | 'waiting' | 'game';

export default function App() {
  const [appState, setAppState] = useState<AppState>('lobby');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [playerIndex, setPlayerIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const handleJoin = (code: string, name: string, id: string, index: number) => {
    setRoomCode(code);
    setPlayerName(name);
    setPlayerId(id);
    setPlayerIndex(index);
    setAppState('waiting');
  };

  const handleGameStart = (gs: GameState) => {
    setGameState(gs);
    setAppState('game');
  };

  if (appState === 'lobby') {
    return <Lobby onJoin={handleJoin} />;
  }

  if (appState === 'waiting') {
    return (
      <WaitingRoom
        roomCode={roomCode}
        playerIndex={playerIndex}
        playerId={playerId}
        playerName={playerName}
        onGameStart={handleGameStart}
      />
    );
  }

  if (appState === 'game' && gameState) {
    return (
      <GameBoard
        roomCode={roomCode}
        playerIndex={playerIndex}
        playerName={playerName}
        initialState={gameState}
      />
    );
  }

  return null;
}
