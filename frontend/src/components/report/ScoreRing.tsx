'use client';

import { useEffect, useState } from 'react';
import { getScoreGrade, getScoreHex } from '@/lib/utils';

interface Props {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export default function ScoreRing({ score, size = 160, strokeWidth = 12, label }: Props) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (animatedScore / 10) * circumference;
  const offset = circumference - progress;
  const color = getScoreHex(score);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimatedScore(score);
    }, 100);
    return () => clearTimeout(timeout);
  }, [score]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="score-ring-progress"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black text-slate-900" style={{ fontSize: size * 0.22 }}>
          {score.toFixed(1)}
        </span>
        <span className="text-slate-400 font-medium" style={{ fontSize: size * 0.1 }}>/ 10</span>
        {label && (
          <span
            className="font-bold rounded mt-1 px-2 py-0.5 text-white"
            style={{ fontSize: size * 0.09, backgroundColor: color }}
          >
            {getScoreGrade(score)}
          </span>
        )}
      </div>
    </div>
  );
}
