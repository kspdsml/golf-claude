import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { GameState } from '../types/game';
import { supabase } from '../lib/supabase';
import {
  handleInitialFlip,
  handleDrawFromDeck,
  handleDrawFromDiscard,
  handleSwapCard,
  handleDiscardDrawn,
  calculateScore,
  deepClone,
  startNextRound,
  initGameState,
} from '../lib/gameLogic';
import { CardComponent } from './CardComponent';

interface Props {
  roomCode: string;
  playerIndex: number;
  playerName: string;
  initialState: GameState;
}

const BG = 'radial-gradient(ellipse 130% 70% at 50% -5%, #0e3d20 0%, #051508 55%, #010804 100%)';

const PANEL: React.CSSProperties = {
  background: 'rgba(8, 22, 10, 0.92)',
  border: '1px solid rgba(212, 160, 23, 0.18)',
  boxShadow: '0 24px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
};

const GOLD_BTN: React.CSSProperties = {
  background: 'linear-gradient(to bottom, #d4a017, #a07010)',
  color: '#1a0f00',
  boxShadow: '0 4px 14px rgba(212,160,23,0.35)',
};

export const GameBoard: React.FC<Props> = ({ roomCode, playerIndex, playerName, initialState }) => {
  const [gameState, setGameState] = useState<GameState>(initialState);
  const [updating, setUpdating] = useState(false);
  const [showResults, setShowResults] = useState(
    initialState.status === 'round_over' || initialState.status === 'finished'
  );
  const [opError, setOpError] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const prevStatusRef = useRef(initialState.status);
  const opErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDisconnected = connStatus === 'disconnected' || connStatus === 'error';

  const ConnBanner = isDisconnected ? (
    <div
      className="w-full max-w-sm mx-auto px-4 py-2 rounded-xl text-xs font-semibold text-center mb-2"
      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: 'rgba(252,165,165,0.9)' }}
    >
      {connStatus === 'error' ? '⚠ Connection error — moves may not sync' : '⚠ Reconnecting…'}
    </div>
  ) : null;

  const OpErrorBanner = opError ? (
    <div
      className="w-full max-w-sm mx-auto px-4 py-2 rounded-xl text-xs font-semibold text-center mb-2"
      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: 'rgba(252,165,165,0.9)' }}
    >
      ⚠ {opError}
    </div>
  ) : null;

  const isMyTurn = gameState.currentPlayer === playerIndex;
  const me = gameState.players[playerIndex];
  const opponent = gameState.players[1 - playerIndex];
  const myScore = me ? calculateScore(me.cards) : 0;
  const oppScore = opponent ? calculateScore(opponent.cards) : 0;

  const myPastTotal = (gameState.roundScores?.[playerIndex] ?? []).reduce((a, b) => a + b, 0);
  const oppPastTotal = (gameState.roundScores?.[1 - playerIndex] ?? []).reduce((a, b) => a + b, 0);
  const myCumulativeScore = myPastTotal + myScore;
  const oppCumulativeScore = oppPastTotal + oppScore;

  const totalRounds = gameState.totalRounds ?? 6;
  const currentRound = gameState.currentRound ?? 1;

  const showOpError = useCallback((msg: string) => {
    setOpError(msg);
    if (opErrorTimerRef.current) clearTimeout(opErrorTimerRef.current);
    opErrorTimerRef.current = setTimeout(() => setOpError(null), 4000);
  }, []);

  const updateState = useCallback(async (newState: GameState) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ game_state: newState })
        .eq('code', roomCode);
      if (error) {
        showOpError('Failed to sync move. Try again.');
      } else {
        setGameState(newState);
      }
    } catch {
      showOpError('Connection error. Check your network.');
    } finally {
      setUpdating(false);
    }
  }, [roomCode, showOpError]);

  useEffect(() => {
    const channel = supabase
      .channel(`game-${roomCode}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${roomCode}`,
      }, (payload) => {
        const gs = payload.new.game_state as GameState;
        setGameState(gs);

        // When both players have voted for rematch, player 0 reinitialises the game
        if (
          gs.status === 'finished' &&
          (gs.rematchVotes?.length ?? 0) >= 2 &&
          playerIndex === 0
        ) {
          const newGame = initGameState(
            gs.players[0].name, gs.players[0].id,
            gs.players[1].name, gs.players[1].id,
            gs.totalRounds,
          );
          supabase.from('rooms').update({ game_state: newGame }).eq('code', roomCode);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnStatus('connected');
        else if (status === 'CHANNEL_ERROR') setConnStatus('error');
        else if (status === 'TIMED_OUT' || status === 'CLOSED') setConnStatus('disconnected');
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomCode, playerIndex]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = gameState.status;

    if (
      (gameState.status === 'round_over' || gameState.status === 'finished') &&
      prev !== 'round_over' && prev !== 'finished'
    ) {
      setShowResults(false);
      const timer = setTimeout(() => setShowResults(true), 2500);
      return () => clearTimeout(timer);
    }
    if (gameState.status === 'initial_flip' || gameState.status === 'playing' || gameState.status === 'last_round') {
      setShowResults(false);
    }
  }, [gameState.status]);

  const handleCardClick = async (cardIndex: number) => {
    if (updating) return;
    const gs = deepClone(gameState);

    if (gs.status === 'initial_flip') {
      if (me && me.initialFlipsDone < 2 && !me.cards[cardIndex].faceUp) {
        const newState = handleInitialFlip(gs, playerIndex, cardIndex);
        await updateState(newState);
      }
      return;
    }

    if (!isMyTurn || gs.turnPhase !== 'act') return;
    const newState = handleSwapCard(gs, playerIndex, cardIndex);
    if (newState !== gs) await updateState(newState);
  };

  const handleDrawDeck = async () => {
    if (!isMyTurn || gameState.turnPhase !== 'draw' || updating) return;
    const newState = handleDrawFromDeck(deepClone(gameState));
    await updateState(newState);
  };

  const handleDrawDiscard = async () => {
    if (!isMyTurn || gameState.turnPhase !== 'draw' || updating) return;
    const newState = handleDrawFromDiscard(deepClone(gameState));
    await updateState(newState);
  };

  const handleDiscard = async () => {
    if (!isMyTurn || gameState.turnPhase !== 'act' || updating) return;
    const newState = handleDiscardDrawn(deepClone(gameState));
    await updateState(newState);
  };

  const handleNextRound = async () => {
    if (playerIndex !== 0 || updating) return;
    const newState = startNextRound(deepClone(gameState));
    await updateState(newState);
  };

  const handlePlayAgain = async () => {
    if (updating) return;
    const gs = deepClone(gameState);
    const votes: number[] = gs.rematchVotes ?? [];
    if (votes.includes(playerIndex)) return; // already voted
    votes.push(playerIndex);
    gs.rematchVotes = votes;

    if (votes.length >= 2 && playerIndex === 0) {
      // Both players ready — player 0 owns the reinit to avoid double-write
      const newGame = initGameState(
        gs.players[0].name, gs.players[0].id,
        gs.players[1].name, gs.players[1].id,
        gs.totalRounds,
      );
      await updateState(newGame);
    } else {
      await updateState(gs);
    }
  };

  const getStatusMessage = () => {
    if (gameState.status === 'round_over' && !showResults) return 'Viewing final cards...';
    if (gameState.status === 'finished' && !showResults) return 'Game over — viewing final cards...';
    if (gameState.status === 'initial_flip') {
      const flipsDone = me?.initialFlipsDone ?? 0;
      if (flipsDone < 2) return `Peek at ${2 - flipsDone} card${flipsDone === 1 ? '' : 's'} before play`;
      return 'Waiting for opponent to peek...';
    }
    if (gameState.status === 'last_round') {
      if (isMyTurn) return 'Last turn — make it count';
      return `${gameState.players[gameState.lastRoundTrigger!]?.name} went out · Last round`;
    }
    if (gameState.status === 'playing') {
      if (isMyTurn) {
        if (gameState.turnPhase === 'draw') return 'Your turn — draw a card';
        return 'Swap with a card or discard';
      }
      return `${opponent?.name}'s turn...`;
    }
    return '';
  };

  // Round over results screen
  if (gameState.status === 'round_over' && showResults) {
    const myRoundScore = gameState.scores?.[playerIndex] ?? 0;
    const oppRoundScore = gameState.scores?.[1 - playerIndex] ?? 0;
    const myTotal = (gameState.roundScores?.[playerIndex] ?? []).reduce((a, b) => a + b, 0);
    const oppTotal = (gameState.roundScores?.[1 - playerIndex] ?? []).reduce((a, b) => a + b, 0);
    const roundWinner = myRoundScore < oppRoundScore ? 'me' : oppRoundScore < myRoundScore ? 'opp' : 'tie';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: BG }}>
        {ConnBanner}
        {OpErrorBanner}
        <div className="w-full max-w-sm rounded-2xl p-6 fade-slide-up" style={PANEL}>
          <div className="text-center mb-5">
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(212,160,23,0.7)' }}>
              Round {currentRound} of {totalRounds}
            </div>
            <div className="text-4xl mb-2">
              {roundWinner === 'tie' ? '🤝' : roundWinner === 'me' ? '⭐' : '😮'}
            </div>
            <h2 className="text-xl font-bold text-white tracking-wide">
              {roundWinner === 'tie' ? 'Tied Round' : roundWinner === 'me' ? 'Round Won!' : 'Round Lost'}
            </h2>
          </div>

          <div className="space-y-2 mb-4">
            {[
              { name: me?.name ?? 'You', roundScore: myRoundScore, total: myTotal, isMe: true },
              { name: opponent?.name ?? 'Opponent', roundScore: oppRoundScore, total: oppTotal, isMe: false },
            ].map(({ name, roundScore, total, isMe }) => (
              <div
                key={name}
                className="p-3 rounded-xl flex items-center justify-between"
                style={isMe ? {
                  background: 'rgba(212,160,23,0.1)',
                  border: '1px solid rgba(212,160,23,0.3)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div>
                  <div className="font-semibold text-sm" style={{ color: isMe ? '#d4a017' : 'rgba(255,255,255,0.85)' }}>
                    {name}{isMe ? ' (you)' : ''}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(134,187,134,0.6)' }}>Total: {total}</div>
                </div>
                <div className="text-2xl font-mono font-bold" style={{ color: isMe ? '#d4a017' : 'rgba(255,255,255,0.9)' }}>
                  {roundScore}
                </div>
              </div>
            ))}
          </div>

          {(gameState.roundScores?.[0]?.length ?? 0) > 1 && (
            <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-xs font-semibold mb-2 uppercase tracking-widest flex justify-between" style={{ color: 'rgba(212,160,23,0.6)' }}>
                <span>History</span>
                <span style={{ color: '#d4a017' }}>{me?.name ?? 'You'}</span>
                <span className="text-white/50">{opponent?.name ?? 'Opp'}</span>
              </div>
              {(gameState.roundScores?.[0] ?? []).map((_, i) => (
                <div key={i} className="flex items-center text-xs py-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="flex-1" style={{ color: 'rgba(100,150,100,0.7)' }}>Round {i + 1}</span>
                  <span className="w-12 text-center font-mono" style={{ color: '#d4a017' }}>{gameState.roundScores[playerIndex][i]}</span>
                  <span className="w-12 text-center font-mono text-white/60">{gameState.roundScores[1 - playerIndex][i]}</span>
                </div>
              ))}
            </div>
          )}

          <div className="text-center">
            {playerIndex === 0 ? (
              <button
                onClick={handleNextRound}
                disabled={updating}
                className="w-full py-3 font-bold rounded-xl transition-all disabled:opacity-50 text-sm tracking-wide"
                style={GOLD_BTN}
              >
                {updating ? 'Starting...' : `Start Round ${currentRound + 1}`}
              </button>
            ) : (
              <div className="py-3" style={{ color: 'rgba(134,187,134,0.6)' }}>
                <div className="flex gap-1.5 justify-center mb-2">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'rgba(212,160,23,0.4)', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-sm">Waiting for host to start next round...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Final game over screen
  if (gameState.status === 'finished' && showResults) {
    const myTotal = (gameState.roundScores?.[playerIndex] ?? []).reduce((a, b) => a + b, 0);
    const oppTotal = (gameState.roundScores?.[1 - playerIndex] ?? []).reduce((a, b) => a + b, 0);
    const won = gameState.winner === playerIndex;
    const tied = gameState.winner === -1;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: BG }}>
        {ConnBanner}
        {OpErrorBanner}
        <div className="w-full max-w-sm rounded-2xl p-6 fade-slide-up" style={PANEL}>
          <div className="text-center mb-6">
            <div className="text-5xl mb-3" style={{ filter: tied || won ? 'drop-shadow(0 0 16px rgba(212,160,23,0.6))' : undefined }}>
              {tied ? '🤝' : won ? '🏆' : '😔'}
            </div>
            <h2 className="text-2xl font-bold text-white tracking-wide">
              {tied ? "It's a Tie!" : won ? 'You Win!' : 'You Lose!'}
            </h2>
            <p className="text-xs mt-1.5 uppercase tracking-widest" style={{ color: 'rgba(134,187,134,0.5)' }}>
              {totalRounds}-round game complete
            </p>
          </div>

          <div className="space-y-2 mb-4">
            {[
              { name: me?.name ?? 'You', total: myTotal, isMe: true },
              { name: opponent?.name ?? 'Opponent', total: oppTotal, isMe: false },
            ].map(({ name, total, isMe }) => (
              <div
                key={name}
                className="p-3 rounded-xl flex items-center justify-between"
                style={isMe ? {
                  background: 'rgba(212,160,23,0.1)',
                  border: '1px solid rgba(212,160,23,0.3)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="font-semibold" style={{ color: isMe ? '#d4a017' : 'rgba(255,255,255,0.85)' }}>
                  {name}{isMe ? ' (you)' : ''}
                </div>
                <div className="text-2xl font-mono font-bold" style={{ color: isMe ? '#d4a017' : 'rgba(255,255,255,0.9)' }}>{total}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-3 mb-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-widest flex justify-between" style={{ color: 'rgba(212,160,23,0.6)' }}>
              <span>Breakdown</span>
              <span style={{ color: '#d4a017' }}>{me?.name ?? 'You'}</span>
              <span className="text-white/50">{opponent?.name ?? 'Opp'}</span>
            </div>
            {(gameState.roundScores?.[0] ?? []).map((_, i) => {
              const myR = gameState.roundScores[playerIndex][i];
              const oppR = gameState.roundScores[1 - playerIndex][i];
              return (
                <div key={i} className="flex items-center text-xs py-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="flex-1" style={{ color: 'rgba(100,150,100,0.7)' }}>Round {i + 1}</span>
                  <span className="w-12 text-center font-mono" style={{ color: myR <= oppR ? '#d4a017' : 'rgba(255,255,255,0.4)' }}>{myR}</span>
                  <span className="w-12 text-center font-mono" style={{ color: oppR <= myR ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}>{oppR}</span>
                </div>
              );
            })}
          </div>

          {(() => {
            const votes = gameState.rematchVotes ?? [];
            const iVoted = votes.includes(playerIndex);
            const bothVoted = votes.length >= 2;
            if (bothVoted) {
              return (
                <div className="py-3 text-center text-sm" style={{ color: 'rgba(134,187,134,0.7)' }}>
                  Starting new game…
                </div>
              );
            }
            if (iVoted) {
              return (
                <div className="py-3 text-center">
                  <div className="flex gap-1.5 justify-center mb-2">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'rgba(212,160,23,0.4)', animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-sm" style={{ color: 'rgba(134,187,134,0.6)' }}>Waiting for opponent…</span>
                </div>
              );
            }
            return (
              <button
                onClick={handlePlayAgain}
                disabled={updating}
                className="w-full py-3 font-bold rounded-xl transition-all disabled:opacity-50 text-sm tracking-wide"
                style={GOLD_BTN}
              >
                {updating ? 'Please wait…' : 'Play Again'}
              </button>
            );
          })()}
        </div>
      </div>
    );
  }

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  const isRevealing = (gameState.status === 'round_over' || gameState.status === 'finished') && !showResults;
  const canDraw = isMyTurn && gameState.turnPhase === 'draw' && !isRevealing;

  return (
    <div className="min-h-screen flex flex-col items-center p-3 gap-3" style={{ background: BG }}>
      {ConnBanner}
      {OpErrorBanner}
      {/* Header */}
      <div className="w-full max-w-sm flex justify-between items-center py-1">
        <div className="font-mono text-xs tracking-widest opacity-40 text-white">#{roomCode}</div>
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-bold tracking-widest">⛳ GOLF</span>
          {totalRounds > 1 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(212,160,23,0.15)', color: 'rgba(212,160,23,0.85)', border: '1px solid rgba(212,160,23,0.2)' }}
            >
              R{currentRound}/{totalRounds}
            </span>
          )}
        </div>
        <div
          className="text-xs px-2.5 py-0.5 rounded-full font-semibold transition-all"
          style={isRevealing ? {
            background: 'rgba(139,92,246,0.3)',
            color: 'rgba(196,181,253,0.9)',
            border: '1px solid rgba(139,92,246,0.3)',
          } : isMyTurn ? {
            background: 'linear-gradient(to right, #d4a017, #a07010)',
            color: '#1a0f00',
            boxShadow: '0 0 10px rgba(212,160,23,0.4)',
          } : {
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(200,200,200,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {isRevealing ? 'Revealing' : isMyTurn ? 'Your Turn' : 'Waiting'}
        </div>
      </div>

      {/* Opponent's hand */}
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="text-xs mb-2 text-center flex items-center gap-2 justify-center" style={{ color: 'rgba(134,187,134,0.65)' }}>
          <span>{opponent?.name ?? 'Opponent'}</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span className="font-mono">{isRevealing ? oppScore : oppCumulativeScore} pts</span>
          {!isMyTurn && (gameState.status === 'playing' || gameState.status === 'last_round') && (
            <span className="font-semibold text-xs" style={{ color: '#d4a017' }}>▶ TURN</span>
          )}
        </div>
        {opponent && (
          <div className="flex flex-col gap-1.5">
            {[[0,1,2],[3,4,5]].map((row, ri) => (
              <div key={ri} className="flex gap-1.5 justify-center">
                {row.map(i => (
                  <CardComponent
                    key={i}
                    card={opponent.cards[i]}
                    flipped={true}
                    small={false}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status message */}
      <div
        className="rounded-xl px-4 py-2 w-full max-w-sm text-center transition-all"
        style={isRevealing ? {
          background: 'rgba(139,92,246,0.12)',
          border: '1px solid rgba(139,92,246,0.2)',
        } : isMyTurn && (gameState.status === 'playing' || gameState.status === 'last_round') ? {
          background: 'rgba(212,160,23,0.1)',
          border: '1px solid rgba(212,160,23,0.25)',
        } : {
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <p className="text-sm font-medium" style={{ color: isMyTurn && !isRevealing ? 'rgba(255,235,180,0.95)' : 'rgba(200,210,200,0.75)' }}>
          {getStatusMessage()}
        </p>
      </div>

      {/* Center: Deck + Drawn Card + Discard */}
      {gameState.status !== 'initial_flip' && (
        <div
          className="w-full max-w-sm rounded-2xl flex items-center justify-center gap-5 py-4 px-4"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(10,28,12,0.95) 0%, rgba(4,12,5,0.98) 100%)',
            border: '1px solid rgba(212,160,23,0.1)',
            boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.5)',
          }}
        >
          {/* Deck */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-xs mb-1" style={{ color: 'rgba(134,187,134,0.5)' }}>{gameState.deck.length} left</div>
            <button
              onClick={handleDrawDeck}
              disabled={!canDraw || updating || isRevealing}
              className={`w-16 h-24 rounded-xl flex items-center justify-center transition-all ${canDraw ? 'turn-pulse' : ''}`}
              style={{
                background: 'linear-gradient(155deg, #1c3161, #111e45)',
                backgroundImage: [
                  'repeating-linear-gradient(45deg, rgba(212,160,23,0.07) 0px, rgba(212,160,23,0.07) 1px, transparent 1px, transparent 9px)',
                  'repeating-linear-gradient(-45deg, rgba(212,160,23,0.07) 0px, rgba(212,160,23,0.07) 1px, transparent 1px, transparent 9px)',
                  'linear-gradient(155deg, #1c3161, #111e45)',
                ].join(', '),
                border: canDraw ? '2px solid rgba(212,160,23,0.7)' : '1px solid rgba(50,70,120,0.6)',
                boxShadow: canDraw ? '0 4px 12px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
                opacity: !isMyTurn || gameState.turnPhase !== 'draw' || isRevealing ? 0.55 : 1,
                cursor: canDraw ? 'pointer' : 'not-allowed',
              }}
            >
              <span className="text-amber-300/30 text-xl">♠</span>
            </button>
          </div>

          {/* Drawn card */}
          {gameState.drawnCard && (
            <div className="flex flex-col items-center gap-1">
              <div className="text-xs mb-1 font-semibold" style={{ color: '#d4a017' }}>Drawn</div>
              <CardComponent card={gameState.drawnCard} />
              {isMyTurn && gameState.turnPhase === 'act' && (
                <button
                  onClick={handleDiscard}
                  disabled={updating}
                  className="mt-1 px-3 py-1 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(180,30,30,0.7)',
                    border: '1px solid rgba(239,68,68,0.4)',
                  }}
                >
                  Discard
                </button>
              )}
            </div>
          )}

          {/* Discard pile */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-xs mb-1" style={{ color: 'rgba(134,187,134,0.5)' }}>Discard</div>
            {topDiscard ? (
              <button
                onClick={handleDrawDiscard}
                disabled={!canDraw || updating || isRevealing}
                className={`transition-all rounded-xl ${canDraw ? 'hover:brightness-110 cursor-pointer active:scale-95' : 'opacity-80 cursor-not-allowed'}`}
              >
                <CardComponent
                  card={topDiscard}
                  highlight={canDraw ? 'select' : 'none'}
                />
              </button>
            ) : (
              <div
                className="w-16 h-24 rounded-xl flex items-center justify-center"
                style={{ border: '1px dashed rgba(134,187,134,0.25)' }}
              >
                <span className="text-xs" style={{ color: 'rgba(100,140,100,0.4)' }}>Empty</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* My hand */}
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="text-xs mb-2 text-center flex items-center gap-2 justify-center" style={{ color: 'rgba(134,187,134,0.65)' }}>
          <span>{me?.name ?? playerName} (you)</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span className="font-mono">{isRevealing ? myScore : myCumulativeScore} pts</span>
          {isMyTurn && (gameState.status === 'playing' || gameState.status === 'last_round') && (
            <span className="font-semibold text-xs" style={{ color: '#d4a017' }}>▶ TURN</span>
          )}
        </div>
        {me && (
          <div className="flex flex-col gap-1.5">
            {[[0,1,2],[3,4,5]].map((row, ri) => (
              <div key={ri} className="flex gap-1.5 justify-center">
                {row.map(i => {
                  const isClickable =
                    !isRevealing && (
                      (gameState.status === 'initial_flip' && !me.cards[i].faceUp && me.initialFlipsDone < 2) ||
                      (isMyTurn && gameState.turnPhase === 'act')
                    );
                  return (
                    <CardComponent
                      key={i}
                      card={me.cards[i]}
                      onClick={isClickable ? () => handleCardClick(i) : undefined}
                      highlight={isClickable ? 'select' : 'none'}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {gameState.status === 'initial_flip' && (
        <div className="text-xs text-center max-w-xs" style={{ color: 'rgba(134,187,134,0.5)' }}>
          Tap {2 - (me?.initialFlipsDone ?? 0)} of your cards to peek before play begins
        </div>
      )}
    </div>
  );
};
