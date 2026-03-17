/**
 * Circular progress rings for calories, protein, carbs, and fat.
 * Animated SVG rings with labels and remaining values.
 */

import { useMemo } from 'react';
import { clamp } from '../lib/utils';

interface MacroRingProps {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
  size?: number;
}

function MacroRing({ label, current, target, unit, color, size = 80 }: MacroRingProps) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = target > 0 ? clamp(current / target, 0, 1) : 0;
  const offset = circumference * (1 - progress);
  const remaining = Math.max(0, target - current);
  const isOver = current > target;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          {/* Progress ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isOver ? 'var(--health-warning)' : color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="animate-ring-fill"
            style={{
              '--ring-circumference': `${circumference}`,
              '--ring-offset': `${offset}`,
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            } as React.CSSProperties}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-semibold text-foreground">{current}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground/60">
        {isOver ? `${current - target}${unit} over` : `${remaining}${unit} left`}
      </span>
    </div>
  );
}

interface MacroRingsProps {
  calories: number;
  calorieTarget: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
}

export function MacroRings({
  calories, calorieTarget,
  protein, proteinTarget,
  carbs, carbsTarget,
  fat, fatTarget,
}: MacroRingsProps) {
  return (
    <div className="flex items-center justify-around gap-2 py-3">
      <MacroRing
        label="Calories"
        current={calories}
        target={calorieTarget}
        unit="cal"
        color="var(--health-calories)"
        size={90}
      />
      <MacroRing
        label="Protein"
        current={protein}
        target={proteinTarget}
        unit="g"
        color="var(--health-protein)"
      />
      <MacroRing
        label="Carbs"
        current={carbs}
        target={carbsTarget}
        unit="g"
        color="var(--health-carbs)"
      />
      <MacroRing
        label="Fat"
        current={fat}
        target={fatTarget}
        unit="g"
        color="var(--health-fat)"
      />
    </div>
  );
}
