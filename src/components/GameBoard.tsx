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
} from '../lib/gameLogic';
import { CardComponent } from './CardComponent';

interface Props {
  roomCode: string;
  playerIndex: number;
  playerName: string;
  initialState: GameState;
}

export const GameBoard: React.FC<Props> = ({ roomCode, playerIndex, playerName, initialState }) => {
  const [gameState, setGameState] = useState<GameState>(initialState);
  const [updating, setUpdating] = useState(false);
  const [showResults, setShowResults] = useState(
    initialState.status === 'round_over' || initialState.status === 'finished'
  );
  const prevStatusRef = useRef(initialState.status);

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

  const updateState = useCallback(async (newState: GameState) => {
    setUpdating(true);
    try {
      await supabase
        .from('rooms')
        .update({ game_state: newState })
        .eq('code', roomCode);
      setGameState(newState);
    } finally {
      setUpdating(false);
    }
  }, [roomCode]);

  useEffect(() => {
    const channel = supabase
      .channel(`game-${roomCode}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${roomCode}`,
      }, (payload) => {
        setGameState(payload.new.game_state);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomCode]);

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

  const getStatusMessage = () => {
    if (gameState.status === 'round_over' && !showResults) return 'Viewing final cards...';
    if (gameState.status === 'finished' && !showResults) return 'Game over — viewing final cards...';
    if (gameState.status === 'initial_flip') {
      const flipsDone = me?.initialFlipsDone ?? 0;
      if (flipsDone < 2) return `Peek at ${2 - flipsDone} card${flipsDone === 1 ? '' : 's'} before play`;
      return 'Waiting for opponent to peek...';
    }
    if (gameState.status === 'last_round') {
      if (isMyTurn) return 'Last turn! Make it count!';
      return `${gameState.players[gameState.lastRoundTrigger!]?.name} went out! Last round.`;
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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(to bottom, #166534, #052e16)' }}>
        <div className="bg-green-800/80 backdrop-blur rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-green-600/50">
          <div className="text-center mb-4">
            <div className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-1">Round {currentRound} of {totalRounds}</div>
            <div className="text-3xl mb-1">
              {roundWinner === 'tie' ? '🤝' : roundWinner === 'me' ? '⭐' : '😮'}
            </div>
            <h2 className="text-xl font-bold text-white">
              {roundWinner === 'tie' ? 'Tied Round' : roundWinner === 'me' ? 'Round Won!' : 'Round Lost'}
            </h2>
          </div>

          {/* Round scores */}
          <div className="space-y-2 mb-4">
            {[
              { name: me?.name ?? 'You', roundScore: myRoundScore, total: myTotal, isMe: true },
              { name: opponent?.name ?? 'Opponent', roundScore: oppRoundScore, total: oppTotal, isMe: false },
            ].map(({ name, roundScore, total, isMe }) => (
              <div key={name} className={`p-3 rounded-xl flex items-center justify-between ${isMe ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-green-900/40 border border-green-700'}`}>
                <div>
                  <div className={`font-semibold text-sm ${isMe ? 'text-yellow-300' : 'text-white'}`}>{name}{isMe ? ' (you)' : ''}</div>
                  <div className="text-green-400 text-xs">Total: {total}</div>
                </div>
                <div className={`text-2xl font-mono font-bold ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                  {roundScore}
                </div>
              </div>
            ))}
          </div>

          {/* Per-round score history */}
          {(gameState.roundScores?.[0]?.length ?? 0) > 1 && (
            <div className="mb-4 bg-green-900/40 rounded-xl p-3 border border-green-700">
              <div className="text-green-400 text-xs font-semibold mb-2 uppercase tracking-wide">Score History</div>
              <div className="space-y-1">
                {(gameState.roundScores?.[0] ?? []).map((_, i) => (
                  <div key={i} className="flex items-center text-xs">
                    <span className="text-green-500 w-14">Round {i + 1}</span>
                    <span className="text-yellow-300 flex-1 text-center">{gameState.roundScores[playerIndex][i]}</span>
                    <span className="text-white flex-1 text-center">{gameState.roundScores[1 - playerIndex][i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center">
            {playerIndex === 0 ? (
              <button
                onClick={handleNextRound}
                disabled={updating}
                className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg"
              >
                {updating ? 'Starting...' : `Start Round ${currentRound + 1}`}
              </button>
            ) : (
              <div className="py-3 text-green-400 text-sm">
                <div className="flex gap-1 justify-center mb-2">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                Waiting for host to start next round...
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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(to bottom, #166534, #052e16)' }}>
        <div className="bg-green-800/80 backdrop-blur rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-green-600/50">
          <div className="text-center mb-5">
            <div className="text-5xl mb-2">{tied ? '🤝' : won ? '🏆' : '😔'}</div>
            <h2 className="text-2xl font-bold text-white">
              {tied ? "It's a Tie!" : won ? 'You Win!' : 'You Lose!'}
            </h2>
            <p className="text-green-400 text-xs mt-1">{totalRounds}-round game complete</p>
          </div>

          {/* Final totals */}
          <div className="space-y-2 mb-4">
            {[
              { name: me?.name ?? 'You', total: myTotal, isMe: true, won: won || (tied) },
              { name: opponent?.name ?? 'Opponent', total: oppTotal, isMe: false, won: !won || tied },
            ].map(({ name, total, isMe }) => (
              <div key={name} className={`p-3 rounded-xl flex items-center justify-between ${isMe ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-green-900/40 border border-green-700'}`}>
                <div className={`font-semibold ${isMe ? 'text-yellow-300' : 'text-white'}`}>{name}{isMe ? ' (you)' : ''}</div>
                <div className={`text-2xl font-mono font-bold ${isMe ? 'text-yellow-300' : 'text-white'}`}>{total}</div>
              </div>
            ))}
          </div>

          {/* Per-round breakdown */}
          <div className="bg-green-900/40 rounded-xl p-3 border border-green-700 mb-5">
            <div className="text-green-400 text-xs font-semibold mb-2 uppercase tracking-wide flex justify-between">
              <span>Round Breakdown</span>
              <span className="text-yellow-400">{me?.name ?? 'You'}</span>
              <span className="text-white">{opponent?.name ?? 'Opp'}</span>
            </div>
            {(gameState.roundScores?.[0] ?? []).map((_, i) => {
              const myR = gameState.roundScores[playerIndex][i];
              const oppR = gameState.roundScores[1 - playerIndex][i];
              return (
                <div key={i} className="flex items-center text-xs py-0.5 border-t border-green-800/60">
                  <span className="text-green-500 flex-1">Round {i + 1}</span>
                  <span className={`w-12 text-center font-mono ${myR < oppR ? 'text-yellow-300 font-bold' : 'text-green-300'}`}>{myR}</span>
                  <span className={`w-12 text-center font-mono ${oppR < myR ? 'text-white font-bold' : 'text-green-400'}`}>{oppR}</span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 font-bold rounded-xl transition-all shadow-lg"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  const isRevealing = (gameState.status === 'round_over' || gameState.status === 'finished') && !showResults;

  return (
    <div className="min-h-screen flex flex-col items-center p-3 gap-3" style={{ background: 'linear-gradient(to bottom, #166534, #052e16)' }}>
      {/* Header */}
      <div className="w-full max-w-sm flex justify-between items-center">
        <div className="text-green-400 text-xs font-mono opacity-70">#{roomCode}</div>
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-semibold">⛳ Golf</span>
          {totalRounds > 1 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-700/60 text-green-300 border border-green-600/50">
              R{currentRound}/{totalRounds}
            </span>
          )}
        </div>
        <div className={`text-xs px-2 py-0.5 rounded-full font-semibold transition-all ${
          isRevealing ? 'bg-purple-700/80 text-purple-200' :
          isMyTurn ? 'bg-yellow-500 text-gray-900' : 'bg-green-700/60 text-green-300'
        }`}>
          {isRevealing ? 'Revealing' : isMyTurn ? 'Your Turn' : 'Waiting'}
        </div>
      </div>

      {/* Opponent's hand */}
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="text-green-300 text-xs mb-1.5 text-center flex items-center gap-2 justify-center">
          <span>{opponent?.name ?? 'Opponent'}</span>
          <span className="text-green-500">·</span>
          <span className="font-mono">{isRevealing ? oppScore : oppCumulativeScore} pts</span>
          {!isMyTurn && (gameState.status === 'playing' || gameState.status === 'last_round') && (
            <span className="text-yellow-400 font-semibold text-xs">▶ TURN</span>
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
      <div className={`rounded-lg px-4 py-2 w-full max-w-sm text-center border transition-all ${
        isRevealing
          ? 'bg-purple-900/40 border-purple-700/50'
          : 'bg-green-900/40 border-green-700/50'
      }`}>
        <p className="text-white text-sm font-medium">{getStatusMessage()}</p>
      </div>

      {/* Center: Deck + Discard + Drawn Card */}
      {gameState.status !== 'initial_flip' && (
        <div className="flex items-center gap-4">
          {/* Deck */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-green-400 text-xs">{gameState.deck.length} left</div>
            <button
              onClick={handleDrawDeck}
              disabled={!isMyTurn || gameState.turnPhase !== 'draw' || updating || isRevealing}
              className={`w-16 h-24 rounded-xl border-2 bg-blue-900 flex items-center justify-center transition-all shadow-lg
                ${isMyTurn && gameState.turnPhase === 'draw' && !isRevealing
                  ? 'border-yellow-400 hover:brightness-110 cursor-pointer active:scale-95 shadow-yellow-900/30'
                  : 'border-blue-800 opacity-60 cursor-not-allowed'}`}
            >
              <span className="text-white text-3xl">🂠</span>
            </button>
          </div>

          {/* Drawn card */}
          {gameState.drawnCard && (
            <div className="flex flex-col items-center gap-1">
              <div className="text-yellow-400 text-xs font-semibold">Drawn</div>
              <CardComponent card={gameState.drawnCard} />
              {isMyTurn && gameState.turnPhase === 'act' && (
                <button
                  onClick={handleDiscard}
                  disabled={updating}
                  className="mt-1 px-3 py-1 bg-red-700/80 hover:bg-red-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all border border-red-600/50"
                >
                  Discard
                </button>
              )}
            </div>
          )}

          {/* Discard pile */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-green-400 text-xs">Discard</div>
            {topDiscard ? (
              <button
                onClick={handleDrawDiscard}
                disabled={!isMyTurn || gameState.turnPhase !== 'draw' || updating || isRevealing}
                className={`transition-all rounded-xl ${
                  isMyTurn && gameState.turnPhase === 'draw' && !isRevealing
                    ? 'hover:brightness-110 cursor-pointer active:scale-95'
                    : 'opacity-80 cursor-not-allowed'
                }`}
              >
                <CardComponent
                  card={topDiscard}
                  highlight={isMyTurn && gameState.turnPhase === 'draw' && !isRevealing ? 'select' : 'none'}
                />
              </button>
            ) : (
              <div className="w-16 h-24 rounded-xl border-2 border-dashed border-green-700 flex items-center justify-center">
                <span className="text-green-600 text-xs">Empty</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* My hand */}
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="text-green-300 text-xs mb-1.5 text-center flex items-center gap-2 justify-center">
          <span>{me?.name ?? playerName} (you)</span>
          <span className="text-green-500">·</span>
          <span className="font-mono">{isRevealing ? myScore : myCumulativeScore} pts</span>
          {isMyTurn && (gameState.status === 'playing' || gameState.status === 'last_round') && (
            <span className="text-yellow-400 font-semibold text-xs">▶ TURN</span>
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
        <div className="text-green-400 text-xs text-center max-w-xs opacity-80">
          Tap {2 - (me?.initialFlipsDone ?? 0)} of your cards to peek before the game starts
        </div>
      )}
    </div>
  );
};
