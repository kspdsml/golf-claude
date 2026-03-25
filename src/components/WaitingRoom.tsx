import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { initGameState } from '../lib/gameLogic';
import type { GameState } from '../types/game';

interface Props {
  roomCode: string;
  playerIndex: number;
  playerId: string;
  playerName: string;
  onGameStart: (gameState: GameState) => void;
}

export const WaitingRoom: React.FC<Props> = ({ roomCode, playerIndex, onGameStart }) => {
  const [players, setPlayers] = React.useState<{name: string}[]>([]);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    // Subscribe to room changes
    const channel = supabase
      .channel(`room-${roomCode}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${roomCode}`,
      }, async (payload) => {
        const gs = payload.new.game_state;
        setPlayers(gs.players || []);

        if (gs.players?.length === 2 && gs.status === 'waiting') {
          // Player 0 initiates the game
          if (playerIndex === 0) {
            const p0 = gs.players[0];
            const p1 = gs.players[1];
            const newState = initGameState(p0.name, p0.id, p1.name, p1.id);
            await supabase
              .from('rooms')
              .update({ game_state: newState })
              .eq('code', roomCode);
          }
        } else if (gs.status === 'initial_flip' || gs.status === 'playing') {
          onGameStart(gs);
        }
      })
      .subscribe();

    // Initial fetch
    supabase
      .from('rooms')
      .select('game_state')
      .eq('code', roomCode)
      .single()
      .then(({ data }) => {
        if (data) {
          const gs = data.game_state;
          setPlayers(gs.players || []);
          if (gs.status !== 'waiting') onGameStart(gs);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomCode, playerIndex, onGameStart]);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-green-900 flex items-center justify-center p-4">
      <div className="bg-green-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-green-600 text-center">
        <div className="text-4xl mb-3">⛳</div>
        <h2 className="text-xl font-bold text-white mb-1">Waiting for opponent...</h2>
        <p className="text-green-300 text-sm mb-6">Share the room code with your friend</p>

        <div className="bg-green-900 rounded-xl p-4 mb-4">
          <div className="text-5xl font-mono font-bold text-yellow-400 tracking-widest mb-2">
            {roomCode}
          </div>
          <button
            onClick={copyCode}
            className="text-sm text-green-300 hover:text-white transition-colors"
          >
            {copied ? '✓ Copied!' : 'Tap to copy'}
          </button>
        </div>

        <div className="space-y-2 mb-6">
          {[0, 1].map(i => (
            <div key={i} className={`flex items-center gap-3 p-2 rounded-lg ${players[i] ? 'bg-green-700' : 'bg-green-900 opacity-50'}`}>
              <div className={`w-3 h-3 rounded-full ${players[i] ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className="text-white text-sm">
                {players[i] ? players[i].name : `Player ${i + 1}`}
                {i === playerIndex ? ' (you)' : ''}
              </span>
              {players[i] && <span className="ml-auto text-green-300 text-xs">✓ Ready</span>}
            </div>
          ))}
        </div>

        <div className="flex gap-1 justify-center">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
};
