import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateRoomCode } from '../lib/gameLogic';

interface Props {
  onJoin: (roomCode: string, playerName: string, playerId: string, playerIndex: number) => void;
}

const BG = 'radial-gradient(ellipse 130% 70% at 50% -5%, #0e3d20 0%, #051508 55%, #010804 100%)';

export const Lobby: React.FC<Props> = ({ onJoin }) => {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'home' | 'join'>('home');
  const [totalRounds, setTotalRounds] = useState(6);

  const playerId = React.useMemo(() => {
    let id = localStorage.getItem('golf_player_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('golf_player_id', id);
    }
    return id;
  }, []);

  async function handleCreate() {
    if (!name.trim()) { setError('Enter your name'); return; }
    setLoading(true);
    setError('');
    try {
      const code = generateRoomCode();
      const initialState = {
        status: 'waiting',
        currentPlayer: 0,
        deck: [],
        discardPile: [],
        players: [{ id: playerId, name: name.trim(), cards: [], initialFlipsDone: 0 }],
        drawnCard: null,
        turnPhase: 'draw',
        lastRoundTrigger: null,
        winner: null,
        scores: null,
        totalRounds,
        currentRound: 1,
        roundScores: [[], []],
      };
      const { error: err } = await supabase.from('rooms').insert({
        code,
        game_state: initialState,
      });
      if (err) throw err;
      onJoin(code, name.trim(), playerId, 0);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) { setError('Enter your name'); return; }
    if (!joinCode.trim()) { setError('Enter room code'); return; }
    setLoading(true);
    setError('');
    try {
      const code = joinCode.trim().toUpperCase();
      const { data, error: err } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single();
      if (err || !data) throw new Error('Room not found');

      const gs = data.game_state;
      if (gs.status !== 'waiting') throw new Error('Game already in progress');
      if (gs.players.length >= 2) throw new Error('Room is full');

      const updatedState = {
        ...gs,
        players: [
          ...gs.players,
          { id: playerId, name: name.trim(), cards: [], initialFlipsDone: 0 },
        ],
      };

      const { error: updateErr } = await supabase
        .from('rooms')
        .update({ game_state: updatedState })
        .eq('code', code);
      if (updateErr) throw updateErr;

      onJoin(code, name.trim(), playerId, 1);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: BG }}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl fade-slide-up"
        style={{
          background: 'rgba(8, 22, 10, 0.92)',
          border: '1px solid rgba(212, 160, 23, 0.18)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="text-center mb-7">
          <div
            className="text-5xl mb-3 inline-block"
            style={{ filter: 'drop-shadow(0 0 12px rgba(212,160,23,0.5))' }}
          >⛳</div>
          <h1
            className="text-3xl font-bold text-white tracking-widest uppercase"
            style={{ letterSpacing: '0.18em', textShadow: '0 0 20px rgba(255,255,255,0.1)' }}
          >Golf</h1>
          <p className="text-green-400 text-xs mt-1.5 tracking-widest uppercase opacity-70">6-Card Multiplayer</p>
        </div>

        <div className="mb-4">
          <label className="text-green-300/80 text-xs font-semibold block mb-1.5 uppercase tracking-widest">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full px-4 py-2.5 rounded-xl text-white placeholder-green-700 transition-colors text-sm"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,160,23,0.6)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          />
        </div>

        {mode === 'home' && (
          <div className="mb-5">
            <label className="text-green-300/80 text-xs font-semibold block mb-2 uppercase tracking-widest">Rounds</label>
            <div className="flex gap-2">
              {[3, 6, 9].map(r => (
                <button
                  key={r}
                  onClick={() => setTotalRounds(r)}
                  className="flex-1 py-2 rounded-xl font-bold text-sm transition-all"
                  style={totalRounds === r ? {
                    background: 'linear-gradient(to bottom, #d4a017, #a07010)',
                    color: '#1a0f00',
                    border: '1px solid rgba(212,160,23,0.5)',
                    boxShadow: '0 4px 12px rgba(212,160,23,0.3)',
                  } : {
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(134,187,134,0.8)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl text-red-300 text-sm" style={{ background: 'rgba(127,29,29,0.5)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {mode === 'home' && (
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 font-bold rounded-xl transition-all disabled:opacity-50 text-sm tracking-wide"
              style={{
                background: 'linear-gradient(to bottom, #d4a017, #a07010)',
                color: '#1a0f00',
                boxShadow: '0 4px 14px rgba(212,160,23,0.35)',
              }}
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
            <button
              onClick={() => setMode('join')}
              disabled={loading}
              className="w-full py-3 font-bold rounded-xl transition-all text-sm tracking-wide"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(200,230,200,0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              Join Room
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-green-300/80 text-xs font-semibold block mb-1.5 uppercase tracking-widest">Room Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="XXXX"
                maxLength={4}
                className="w-full px-3 py-3 rounded-xl text-white placeholder-green-800 transition-colors text-center text-2xl font-mono tracking-widest uppercase"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,160,23,0.6)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-3 font-bold rounded-xl transition-all disabled:opacity-50 text-sm tracking-wide"
              style={{
                background: 'linear-gradient(to bottom, #d4a017, #a07010)',
                color: '#1a0f00',
                boxShadow: '0 4px 14px rgba(212,160,23,0.35)',
              }}
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
            <button
              onClick={() => { setMode('home'); setError(''); }}
              className="w-full py-2 text-green-500/70 hover:text-green-300 text-sm transition-colors"
            >
              ← Back
            </button>
          </div>
        )}

        <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-green-700 text-xs text-center leading-relaxed font-mono">
            K=0 · A=1 · 2=−2 · J/Q=10 · others=face value<br/>
            Matching column = 0 pts · Lowest total wins
          </p>
        </div>
      </div>
    </div>
  );
};
