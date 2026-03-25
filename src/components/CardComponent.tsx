import React from 'react';
import type { Card } from '../types/game';
import { suitSymbol, suitColor } from '../lib/gameLogic';

interface Props {
  card: Card;
  onClick?: () => void;
  highlight?: 'select' | 'match' | 'none';
  small?: boolean;
  flipped?: boolean; // display upside down (opponent's perspective)
}

export const CardComponent: React.FC<Props> = ({ card, onClick, highlight = 'none', small = false, flipped = false }) => {
  const size = small ? 'w-12 h-18' : 'w-16 h-24';
  const textSize = small ? 'text-xs' : 'text-sm';
  const symbolSize = small ? 'text-lg' : 'text-2xl';

  const borderColor =
    highlight === 'select' ? 'border-yellow-400 border-4 shadow-yellow-300 shadow-lg' :
    highlight === 'match' ? 'border-green-400 border-4' :
    'border-gray-300 border-2';

  if (!card.faceUp) {
    return (
      <button
        onClick={onClick}
        className={`${size} rounded-lg ${borderColor} bg-blue-800 flex items-center justify-center cursor-pointer transition-all hover:brightness-110 active:scale-95 select-none`}
        style={{ transform: flipped ? 'rotate(180deg)' : undefined }}
      >
        <div className="w-full h-full rounded flex items-center justify-center">
          <svg viewBox="0 0 40 60" className="w-10 h-14 opacity-30" fill="white">
            <pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="2" fill="white" />
            </pattern>
            <rect width="40" height="60" fill="url(#p)" />
          </svg>
        </div>
      </button>
    );
  }

  const color = suitColor(card.suit);
  const symbol = suitSymbol(card.suit);

  return (
    <button
      onClick={onClick}
      className={`${size} rounded-lg ${borderColor} bg-white flex flex-col items-start justify-between p-1 cursor-pointer transition-all hover:brightness-95 active:scale-95 select-none`}
      style={{ transform: flipped ? 'rotate(180deg)' : undefined }}
    >
      <div className={`${textSize} font-bold ${color} leading-none`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
      <div className={`${symbolSize} ${color} self-center`}>{symbol}</div>
      <div className={`${textSize} font-bold ${color} self-end leading-none rotate-180`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
    </button>
  );
};
