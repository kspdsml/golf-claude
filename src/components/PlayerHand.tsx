import React from 'react';
import type { Card } from '../types/game';
import { CardComponent } from './CardComponent';

interface Props {
  cards: Card[];
  onCardClick?: (index: number) => void;
  highlightIndices?: Set<number>;
  flipped?: boolean;
  label?: string;
  score?: number;
  isCurrentTurn?: boolean;
}

export const PlayerHand: React.FC<Props> = ({
  cards,
  onCardClick,
  highlightIndices = new Set(),
  flipped = false,
  label,
  score,
  isCurrentTurn = false,
}) => {
  // Cards layout: 0,1,2 top row; 3,4,5 bottom row
  const topRow = [0, 1, 2];
  const botRow = [3, 4, 5];

  const rows = flipped ? [botRow, topRow] : [topRow, botRow];

  return (
    <div className={`flex flex-col items-center gap-1 ${flipped ? 'rotate-180' : ''}`}>
      {label && (
        <div className={`text-white text-sm font-semibold mb-1 ${isCurrentTurn ? 'text-yellow-300' : ''} ${flipped ? 'rotate-180' : ''}`}>
          {label} {score !== undefined ? `(${score} pts)` : ''} {isCurrentTurn ? '← TURN' : ''}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {rows.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            {row.map(i => (
              <CardComponent
                key={i}
                card={cards[i]}
                onClick={onCardClick ? () => onCardClick(i) : undefined}
                highlight={highlightIndices.has(i) ? 'select' : 'none'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
