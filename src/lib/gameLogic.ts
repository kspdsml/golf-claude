import type { Card, GameState, PlayerState, Rank, Suit } from '../types/game';

export function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  return shuffle(deck);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 1;
  if (rank === '2') return -2;
  if (rank === 'K') return 0;
  if (rank === 'J' || rank === 'Q') return 10;
  return parseInt(rank);
}

export function calculateScore(cards: Card[]): number {
  // Layout: indices 0,1,2 = top row; 3,4,5 = bottom row
  // Columns: (0,3), (1,4), (2,5)
  let score = 0;
  for (let col = 0; col < 3; col++) {
    const top = cards[col];
    const bot = cards[col + 3];
    if (top.faceUp && bot.faceUp && top.rank === bot.rank) {
      // Column match → scores 0
    } else {
      if (top.faceUp) score += cardValue(top.rank);
      if (bot.faceUp) score += cardValue(bot.rank);
    }
  }
  return score;
}

export function allFaceUp(cards: Card[]): boolean {
  return cards.every(c => c.faceUp);
}

export function initGameState(
  player0Name: string,
  player0Id: string,
  player1Name: string,
  player1Id: string,
  totalRounds: number = 6
): GameState {
  const deck = createDeck();
  const p0Cards = deck.splice(0, 6);
  const p1Cards = deck.splice(0, 6);
  const firstDiscard = deck.splice(0, 1);
  firstDiscard[0].faceUp = true;

  const players: PlayerState[] = [
    { id: player0Id, name: player0Name, cards: p0Cards, initialFlipsDone: 0 },
    { id: player1Id, name: player1Name, cards: p1Cards, initialFlipsDone: 0 },
  ];

  return {
    status: 'initial_flip',
    currentPlayer: 0,
    deck,
    discardPile: firstDiscard,
    players,
    drawnCard: null,
    turnPhase: 'draw',
    lastRoundTrigger: null,
    winner: null,
    scores: null,
    totalRounds,
    currentRound: 1,
    roundScores: [[], []],
  };
}

export function startNextRound(state: GameState): GameState {
  const deck = createDeck();
  const p0Cards = deck.splice(0, 6);
  const p1Cards = deck.splice(0, 6);
  const firstDiscard = deck.splice(0, 1);
  firstDiscard[0].faceUp = true;

  return {
    ...state,
    status: 'initial_flip',
    currentRound: state.currentRound + 1,
    currentPlayer: 0,
    deck,
    discardPile: firstDiscard,
    players: [
      { ...state.players[0], cards: p0Cards, initialFlipsDone: 0 },
      { ...state.players[1], cards: p1Cards, initialFlipsDone: 0 },
    ],
    drawnCard: null,
    turnPhase: 'draw',
    lastRoundTrigger: null,
    scores: null,
  };
}

export function handleInitialFlip(state: GameState, playerIndex: number, cardIndex: number): GameState {
  const newState = deepClone(state);
  const player = newState.players[playerIndex];
  if (player.initialFlipsDone >= 2) return state;
  if (player.cards[cardIndex].faceUp) return state;

  player.cards[cardIndex].faceUp = true;
  player.initialFlipsDone += 1;

  const bothReady = newState.players.every(p => p.initialFlipsDone >= 2);
  if (bothReady) {
    newState.status = 'playing';
    newState.currentPlayer = 0;
    newState.turnPhase = 'draw';
  }

  return newState;
}

export function handleDrawFromDeck(state: GameState): GameState {
  if (state.turnPhase !== 'draw' || state.deck.length === 0) return state;
  const newState = deepClone(state);
  const card = newState.deck.shift()!;
  card.faceUp = true;
  newState.drawnCard = card;
  newState.turnPhase = 'act';
  return newState;
}

export function handleDrawFromDiscard(state: GameState): GameState {
  if (state.turnPhase !== 'draw' || state.discardPile.length === 0) return state;
  const newState = deepClone(state);
  const card = newState.discardPile.pop()!;
  newState.drawnCard = card;
  newState.turnPhase = 'act';
  return newState;
}

export function handleSwapCard(state: GameState, playerIndex: number, cardIndex: number): GameState {
  if (state.turnPhase !== 'act' || state.currentPlayer !== playerIndex || !state.drawnCard) return state;
  const newState = deepClone(state);
  const player = newState.players[playerIndex];
  const oldCard = player.cards[cardIndex];
  oldCard.faceUp = true;
  newState.discardPile.push(oldCard);
  const newCard: Card = { ...newState.drawnCard!, faceUp: true };
  player.cards[cardIndex] = newCard;
  newState.drawnCard = null;

  return advanceTurn(newState, playerIndex);
}

export function handleDiscardDrawn(state: GameState): GameState {
  if (state.turnPhase !== 'act' || !state.drawnCard) return state;
  const newState = deepClone(state);
  newState.discardPile.push({ ...newState.drawnCard!, faceUp: true });
  newState.drawnCard = null;

  return advanceTurn(newState, newState.currentPlayer);
}

function advanceTurn(state: GameState, currentPlayerIndex: number): GameState {
  const player = state.players[currentPlayerIndex];

  if (allFaceUp(player.cards)) {
    if (state.lastRoundTrigger === null) {
      state.lastRoundTrigger = currentPlayerIndex;
      state.status = 'last_round';
      state.currentPlayer = 1 - currentPlayerIndex;
      state.turnPhase = 'draw';
    } else {
      return finishRound(state);
    }
  } else if (state.status === 'last_round') {
    return finishRound(state);
  } else {
    state.currentPlayer = 1 - currentPlayerIndex;
    state.turnPhase = 'draw';
  }

  return state;
}

function finishRound(state: GameState): GameState {
  for (const player of state.players) {
    for (const card of player.cards) {
      card.faceUp = true;
    }
  }

  const score0 = calculateScore(state.players[0].cards);
  const score1 = calculateScore(state.players[1].cards);
  state.scores = [score0, score1];

  state.roundScores = [
    [...(state.roundScores?.[0] ?? []), score0],
    [...(state.roundScores?.[1] ?? []), score1],
  ];

  const totalRounds = state.totalRounds ?? 6;
  if (state.currentRound < totalRounds) {
    state.status = 'round_over';
    state.winner = null;
  } else {
    state.status = 'finished';
    const total0 = state.roundScores[0].reduce((a, b) => a + b, 0);
    const total1 = state.roundScores[1].reduce((a, b) => a + b, 0);
    if (total0 < total1) state.winner = 0;
    else if (total1 < total0) state.winner = 1;
    else state.winner = -1;
  }

  return state;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function suitSymbol(suit: string): string {
  const map: Record<string, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };
  return map[suit] || '?';
}

export function suitColor(suit: string): string {
  return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-900';
}
