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
  const size = small ? 'w-12 h-[4.5rem]' : 'w-16 h-24';
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

  const isSelect = highlight === 'select';

  const borderColor =
    isSelect ? 'border-amber-400 border-[2.5px]' :
    highlight === 'match' ? 'border-green-400 border-[2.5px]' :
    'border-gray-300/60 border';

  const flipClass = flipping ? 'card-flip-in' : '';
  const pulseClass = isSelect ? 'turn-pulse' : '';

  if (!card.faceUp) {
    return (
      <button
        onClick={onClick}
        className={`${size} rounded-xl ${borderColor} flex items-center justify-center cursor-pointer transition-all hover:brightness-125 active:scale-95 select-none ${pulseClass}`}
        style={{
          background: 'linear-gradient(155deg, #1c3161, #111e45)',
          backgroundImage: [
            'repeating-linear-gradient(45deg, rgba(212,160,23,0.07) 0px, rgba(212,160,23,0.07) 1px, transparent 1px, transparent 9px)',
            'repeating-linear-gradient(-45deg, rgba(212,160,23,0.07) 0px, rgba(212,160,23,0.07) 1px, transparent 1px, transparent 9px)',
            'linear-gradient(155deg, #1c3161, #111e45)',
          ].join(', '),
          boxShadow: '0 4px 10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)',
          transform: flipped ? 'rotate(180deg)' : undefined,
        }}
      >
        <div className="w-full h-full rounded-xl flex items-center justify-center">
          <div className="opacity-20 text-amber-300 text-xl">♠</div>
        </div>
      </button>
    );
  }

  const color = suitColor(card.suit);
  const symbol = suitSymbol(card.suit);

  return (
    <button
      onClick={onClick}
      className={`${size} rounded-xl ${borderColor} bg-white flex flex-col items-start justify-between p-1.5 cursor-pointer transition-all hover:brightness-95 active:scale-95 select-none ${flipClass} ${pulseClass}`}
      style={{
        transform: flipped ? 'rotate(180deg)' : undefined,
        boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.04)',
      }}
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
