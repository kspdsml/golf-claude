export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  cards: Card[];
  initialFlipsDone: number;
}

export type GameStatus = 'waiting' | 'initial_flip' | 'playing' | 'last_round' | 'finished';
export type TurnPhase = 'draw' | 'act';

export interface GameState {
  status: GameStatus;
  currentPlayer: number;
  deck: Card[];
  discardPile: Card[];
  players: PlayerState[];
  drawnCard: Card | null;
  turnPhase: TurnPhase;
  lastRoundTrigger: number | null;
  winner: number | null;
  scores: [number, number] | null;
}

export interface Room {
  id: string;
  code: string;
  game_state: GameState;
  created_at: string;
}
