import React, { useEffect, useState, useCallback } from 'react';
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

  const isMyTurn = gameState.currentPlayer === playerIndex;
  const me = gameState.players[playerIndex];
  const opponent = gameState.players[1 - playerIndex];
  const myScore = me ? calculateScore(me.cards) : 0;
  const oppScore = opponent ? calculateScore(opponent.cards) : 0;

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

  const getStatusMessage = () => {
    if (gameState.status === 'initial_flip') {
      const flipsDone = me?.initialFlipsDone ?? 0;
      if (flipsDone < 2) return `Flip ${2 - flipsDone} more card${flipsDone === 1 ? '' : 's'}`;
      return 'Waiting for opponent to flip...';
    }
    if (gameState.status === 'last_round') {
      if (isMyTurn) return 'Last turn! Make it count!';
      return `${gameState.players[gameState.lastRoundTrigger!]?.name} went out! Last round.`;
    }
    if (gameState.status === 'playing') {
      if (isMyTurn) {
        if (gameState.turnPhase === 'draw') return 'Your turn: Draw a card';
        return 'Swap with a card or discard';
      }
      return `${opponent?.name}'s turn...`;
    }
    return '';
  };

  if (gameState.status === 'finished') {
    const myFinalScore = gameState.scores?.[playerIndex] ?? 0;
    const oppFinalScore = gameState.scores?.[1 - playerIndex] ?? 0;
    const won = gameState.winner === playerIndex;
    const tied = gameState.winner === -1;

    return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center p-4">
        <div className="bg-green-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-green-600 text-center">
          <div className="text-5xl mb-3">{tied ? '🤝' : won ? '🏆' : '😔'}</div>
          <h2 className="text-2xl font-bold text-white mb-1">
            {tied ? "It's a Tie!" : won ? 'You Win!' : 'You Lose!'}
          </h2>
          <div className="space-y-3 mt-4">
            {[
              { name: me?.name ?? 'You', score: myFinalScore, isMe: true },
              { name: opponent?.name ?? 'Opponent', score: oppFinalScore, isMe: false },
            ].map(({ name, score, isMe }) => (
              <div key={name} className={`p-3 rounded-xl ${isMe ? 'bg-yellow-500 text-gray-900' : 'bg-green-700 text-white'}`}>
                <div className="font-bold">{name} {isMe ? '(you)' : ''}</div>
                <div className="text-2xl font-mono font-bold">{score} pts</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold rounded-xl"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center p-3 gap-3">
      {/* Header */}
      <div className="w-full max-w-sm flex justify-between items-center">
        <div className="text-green-300 text-xs font-mono">Room: {roomCode}</div>
        <div className="text-white text-sm font-semibold">⛳ Golf</div>
        <div className={`text-xs px-2 py-0.5 rounded-full ${isMyTurn ? 'bg-yellow-500 text-gray-900 font-bold' : 'bg-green-700 text-green-300'}`}>
          {isMyTurn ? 'Your Turn' : 'Waiting'}
        </div>
      </div>

      {/* Opponent's hand */}
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="text-green-200 text-xs mb-1 text-center">
          {opponent?.name ?? 'Opponent'} — {oppScore} pts
          {!isMyTurn && gameState.status === 'playing' && (
            <span className="ml-2 text-yellow-300 font-semibold">← TURN</span>
          )}
        </div>
        {opponent && (
          <div className="flex flex-col gap-1">
            {[[0,1,2],[3,4,5]].map((row, ri) => (
              <div key={ri} className="flex gap-1 justify-center">
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
      <div className="bg-green-800 border border-green-600 rounded-lg px-4 py-2 w-full max-w-sm text-center">
        <p className="text-white text-sm font-medium">{getStatusMessage()}</p>
      </div>

      {/* Center: Deck + Discard + Drawn Card */}
      {gameState.status !== 'initial_flip' && (
        <div className="flex items-center gap-4">
          {/* Deck */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-green-300 text-xs">Deck ({gameState.deck.length})</div>
            <button
              onClick={handleDrawDeck}
              disabled={!isMyTurn || gameState.turnPhase !== 'draw' || updating}
              className={`w-16 h-24 rounded-lg border-2 bg-blue-800 flex items-center justify-center transition-all
                ${isMyTurn && gameState.turnPhase === 'draw' ? 'border-yellow-400 hover:brightness-110 cursor-pointer active:scale-95' : 'border-gray-600 opacity-60 cursor-not-allowed'}`}
            >
              <span className="text-white text-3xl">🂠</span>
            </button>
          </div>

          {/* Drawn card */}
          {gameState.drawnCard && (
            <div className="flex flex-col items-center gap-1">
              <div className="text-yellow-300 text-xs font-semibold">Drawn</div>
              <CardComponent card={gameState.drawnCard} />
              {isMyTurn && gameState.turnPhase === 'act' && (
                <button
                  onClick={handleDiscard}
                  disabled={updating}
                  className="mt-1 px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg"
                >
                  Discard
                </button>
              )}
            </div>
          )}

          {/* Discard pile */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-green-300 text-xs">Discard</div>
            {topDiscard ? (
              <button
                onClick={handleDrawDiscard}
                disabled={!isMyTurn || gameState.turnPhase !== 'draw' || updating}
                className={`transition-all ${isMyTurn && gameState.turnPhase === 'draw' ? 'hover:brightness-110 cursor-pointer active:scale-95' : 'opacity-80 cursor-not-allowed'}`}
              >
                <CardComponent
                  card={topDiscard}
                  highlight={isMyTurn && gameState.turnPhase === 'draw' ? 'select' : 'none'}
                />
              </button>
            ) : (
              <div className="w-16 h-24 rounded-lg border-2 border-dashed border-green-500 flex items-center justify-center">
                <span className="text-green-500 text-xs">Empty</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* My hand */}
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="text-green-200 text-xs mb-1 text-center">
          {me?.name ?? playerName} (you) — {myScore} pts
          {isMyTurn && gameState.status === 'playing' && (
            <span className="ml-2 text-yellow-300 font-semibold">← TURN</span>
          )}
        </div>
        {me && (
          <div className="flex flex-col gap-1">
            {[[0,1,2],[3,4,5]].map((row, ri) => (
              <div key={ri} className="flex gap-1 justify-center">
                {row.map(i => {
                  const isClickable =
                    (gameState.status === 'initial_flip' && !me.cards[i].faceUp && me.initialFlipsDone < 2) ||
                    (isMyTurn && gameState.turnPhase === 'act');
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

      {/* Instructions */}
      {gameState.status === 'initial_flip' && (
        <div className="text-green-300 text-xs text-center max-w-xs">
          Tap {2 - (me?.initialFlipsDone ?? 0)} of your cards to peek before the game starts
        </div>
      )}
    </div>
  );
};
