import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateRoomCode } from '../lib/gameLogic';

interface Props {
  onJoin: (roomCode: string, playerName: string, playerId: string, playerIndex: number) => void;
}

export const Lobby: React.FC<Props> = ({ onJoin }) => {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'home' | 'join'>('home');

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

      // Add player 2
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
    <div className="min-h-screen bg-green-900 flex items-center justify-center p-4">
      <div className="bg-green-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-green-600">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">⛳</div>
          <h1 className="text-3xl font-bold text-white">Golf</h1>
          <p className="text-green-300 text-sm mt-1">6-Card Multiplayer</p>
        </div>

        <div className="mb-4">
          <label className="text-green-200 text-sm font-medium block mb-1">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full px-3 py-2 rounded-lg bg-green-700 text-white placeholder-green-400 border border-green-500 focus:outline-none focus:border-yellow-400"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-800 border border-red-600 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        {mode === 'home' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
            <button
              onClick={() => setMode('join')}
              disabled={loading}
              className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-colors border border-green-400"
            >
              Join Room
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-green-200 text-sm font-medium block mb-1">Room Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="XXXX"
                maxLength={4}
                className="w-full px-3 py-2 rounded-lg bg-green-700 text-white placeholder-green-400 border border-green-500 focus:outline-none focus:border-yellow-400 text-center text-2xl font-mono tracking-widest uppercase"
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
            <button
              onClick={() => { setMode('home'); setError(''); }}
              className="w-full py-2 text-green-300 hover:text-white text-sm transition-colors"
            >
              ← Back
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-green-600">
          <p className="text-green-400 text-xs text-center">
            Card values: K=0, A=1, 2=-2, J/Q=10, others=face value<br/>
            Matching column = 0 pts • Lowest score wins!
          </p>
        </div>
      </div>
    </div>
  );
};
