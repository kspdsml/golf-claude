import React, { useEffect, useRef, useState } from 'react';
import type { Card } from '../types/game';
import { suitSymbol, suitColor } from '../lib/gameLogic';

interface Props {
  card: Card;
  onClick?: () => void;
  highlight?: 'select' | 'match' | 'none';
  small?: boolean;
  flipped?: boolean;
}

export const CardComponent: React.FC<Props> = ({ card, onClick, highlight = 'none', small = false, flipped = false }) => {
  const size = small ? 'w-12 h-18' : 'w-16 h-24';
  const textSize = small ? 'text-xs' : 'text-sm';
  const symbolSize = small ? 'text-lg' : 'text-2xl';
  const prevFaceUp = useRef(card.faceUp);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (!prevFaceUp.current && card.faceUp) {
      setFlipping(true);
      const t = setTimeout(() => setFlipping(false), 380);
      return () => clearTimeout(t);
    }
    prevFaceUp.current = card.faceUp;
  }, [card.faceUp]);

  const borderColor =
    highlight === 'select' ? 'border-yellow-400 border-[3px] shadow-yellow-400/40 shadow-lg' :
    highlight === 'match' ? 'border-green-400 border-[3px]' :
    'border-gray-200/80 border-2';

  const flipClass = flipping ? 'card-flip-in' : '';

  if (!card.faceUp) {
    return (
      <button
        onClick={onClick}
        className={`${size} rounded-xl ${borderColor} flex items-center justify-center cursor-pointer transition-all hover:brightness-110 active:scale-95 select-none shadow-md`}
        style={{
          background: 'linear-gradient(135deg, #1e3a8a, #1e40af)',
          transform: flipped ? 'rotate(180deg)' : undefined,
        }}
      >
        <div className="w-full h-full rounded-xl flex items-center justify-center overflow-hidden">
          <svg viewBox="0 0 40 60" className="w-10 h-14 opacity-20" fill="white">
            <pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="1.5" fill="white" />
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
      className={`${size} rounded-xl ${borderColor} bg-white flex flex-col items-start justify-between p-1.5 cursor-pointer transition-all hover:brightness-95 active:scale-95 select-none shadow-md ${flipClass}`}
      style={{ transform: flipped ? 'rotate(180deg)' : undefined }}
    >
      <div className={`${textSize} font-bold ${color} leading-none`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
      <div className={`${symbolSize} ${color} self-center leading-none`}>{symbol}</div>
      <div className={`${textSize} font-bold ${color} self-end leading-none rotate-180`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
    </button>
  );
};
