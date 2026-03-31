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

const BG = 'radial-gradient(ellipse 130% 70% at 50% -5%, #0e3d20 0%, #051508 55%, #010804 100%)';

export const WaitingRoom: React.FC<Props> = ({ roomCode, playerIndex, onGameStart }) => {
  const [players, setPlayers] = React.useState<{name: string}[]>([]);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
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
          if (playerIndex === 0) {
            const p0 = gs.players[0];
            const p1 = gs.players[1];
            const newState = initGameState(p0.name, p0.id, p1.name, p1.id, gs.totalRounds || 6);
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: BG }}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center fade-slide-up"
        style={{
          background: 'rgba(8, 22, 10, 0.92)',
          border: '1px solid rgba(212, 160, 23, 0.18)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="text-4xl mb-3 inline-block"
          style={{ filter: 'drop-shadow(0 0 10px rgba(212,160,23,0.4))' }}
        >⛳</div>
        <h2 className="text-xl font-bold text-white mb-1 tracking-wide">Waiting for opponent</h2>
        <p className="text-green-500/70 text-sm mb-6">Share your room code with a friend</p>

        <button
          onClick={copyCode}
          className="w-full rounded-2xl p-5 mb-5 transition-all"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(212,160,23,0.25)',
          }}
        >
          <div
            className="text-5xl font-mono font-bold tracking-widest mb-2"
            style={{ color: '#d4a017', textShadow: '0 0 20px rgba(212,160,23,0.4)' }}
          >
            {roomCode}
          </div>
          <div className="text-xs text-green-500/60 tracking-widest uppercase">
            {copied ? '✓ Copied to clipboard' : 'Tap to copy'}
          </div>
        </button>

        <div className="space-y-2 mb-6">
          {[0, 1].map(i => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl transition-all"
              style={{
                background: players[i] ? 'rgba(212,160,23,0.08)' : 'rgba(255,255,255,0.03)',
                border: players[i] ? '1px solid rgba(212,160,23,0.2)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: players[i] ? '#4ade80' : 'rgba(255,255,255,0.15)' }}
              />
              <span className="text-white text-sm flex-1 text-left">
                {players[i] ? players[i].name : `Player ${i + 1}`}
                {i === playerIndex ? <span className="text-green-500/60 text-xs ml-1">(you)</span> : ''}
              </span>
              {players[i] && (
                <span className="text-green-400 text-xs opacity-70">Ready</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-1.5 justify-center">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: 'rgba(212,160,23,0.5)', animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
