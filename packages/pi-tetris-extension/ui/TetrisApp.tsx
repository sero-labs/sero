// ui/TetrisApp.tsx — Main Tetris component

import { useEffect, useMemo, useRef } from 'react';
import { useAppState } from '@sero/app-runtime';
import type { TetrisState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { useGame } from './game/useGame';
import {
  BOARD_ROWS,
  BOARD_COLS,
  CELL_SIZE,
  PIECE_COLORS,
  SHAPES,
  type PieceType,
} from './game/types';

function getCellDisplay(
  row: number,
  col: number,
  board: (PieceType | null)[][],
  currentPiece: {
    type: PieceType;
    shape: number[][];
    row: number;
    col: number;
  } | null,
  ghostRow: number,
): { color: string; opacity: number } | null {
  if (currentPiece) {
    const pr = row - currentPiece.row;
    const pc = col - currentPiece.col;
    if (
      pr >= 0 &&
      pr < currentPiece.shape.length &&
      pc >= 0 &&
      pc < currentPiece.shape[0].length &&
      currentPiece.shape[pr][pc]
    ) {
      return { color: PIECE_COLORS[currentPiece.type], opacity: 1 };
    }
    const gr = row - ghostRow;
    const gc = col - currentPiece.col;
    if (
      gr >= 0 &&
      gr < currentPiece.shape.length &&
      gc >= 0 &&
      gc < currentPiece.shape[0].length &&
      currentPiece.shape[gr][gc]
    ) {
      return { color: PIECE_COLORS[currentPiece.type], opacity: 0.2 };
    }
  }
  const cell = board[row]?.[col];
  if (cell) return { color: PIECE_COLORS[cell], opacity: 1 };
  return null;
}

function NextPiecePreview({ type }: { type: PieceType }) {
  const shape = SHAPES[type];
  const color = PIECE_COLORS[type];
  return (
    <div className="flex flex-col items-center gap-0.5">
      {shape.map((row, r) => (
        <div key={r} className="flex gap-0.5">
          {row.map((cell, c) => (
            <div
              key={c}
              style={{
                width: 16,
                height: 16,
                borderRadius: 2,
                backgroundColor: cell ? color : 'transparent',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TetrisApp() {
  const [persisted, updatePersisted] = useAppState<TetrisState>(DEFAULT_STATE);
  const game = useGame();
  const prevGameOver = useRef(false);

  // Update persisted state on game-over transition
  useEffect(() => {
    if (game.gameOver && !prevGameOver.current) {
      updatePersisted((prev) => ({
        highScore: Math.max(prev.highScore, game.score),
        gamesPlayed: prev.gamesPlayed + 1,
        totalLinesCleared: prev.totalLinesCleared + game.lines,
      }));
    }
    prevGameOver.current = game.gameOver;
  }, [game.gameOver, game.score, game.lines, updatePersisted]);

  const cells = useMemo(() => {
    const result: ({ color: string; opacity: number } | null)[][] = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      const row: ({ color: string; opacity: number } | null)[] = [];
      for (let c = 0; c < BOARD_COLS; c++) {
        row.push(
          getCellDisplay(
            r,
            c,
            game.board,
            game.currentPiece,
            game.ghostRow,
          ),
        );
      }
      result.push(row);
    }
    return result;
  }, [game.board, game.currentPiece, game.ghostRow]);

  return (
    <div
      className="relative flex h-full items-center justify-center bg-[var(--bg-base)]"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <div className="flex gap-6">
        {/* Game Board */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${BOARD_COLS}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_ROWS}, ${CELL_SIZE}px)`,
            gap: 1,
            padding: 2,
            backgroundColor: '#0a0b0f',
            borderRadius: 8,
            border: '2px solid rgba(255,255,255,0.08)',
          }}
        >
          {cells.flat().map((cell, i) => (
            <div
              key={i}
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                borderRadius: 3,
                backgroundColor: cell
                  ? cell.color
                  : 'rgba(255,255,255,0.03)',
                opacity: cell ? cell.opacity : 1,
              }}
            />
          ))}
        </div>

        {/* Info Panel */}
        <div className="flex w-40 flex-col gap-4">
          <div className="rounded-lg bg-[var(--bg-surface)] p-3">
            <div className="text-xs text-[var(--text-muted)]">Score</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {game.score.toLocaleString()}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 rounded-lg bg-[var(--bg-surface)] p-3">
              <div className="text-xs text-[var(--text-muted)]">Level</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">
                {game.level}
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-[var(--bg-surface)] p-3">
              <div className="text-xs text-[var(--text-muted)]">Lines</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">
                {game.lines}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-[var(--bg-surface)] p-3">
            <div className="mb-2 text-xs text-[var(--text-muted)]">Next</div>
            <div className="flex justify-center">
              <NextPiecePreview type={game.nextType} />
            </div>
          </div>

          <div className="rounded-lg bg-[var(--bg-surface)] p-3">
            <div className="text-xs text-[var(--text-muted)]">High Score</div>
            <div className="text-lg font-bold text-[var(--accent)]">
              {persisted.highScore.toLocaleString()}
            </div>
          </div>

          {!game.started || game.gameOver ? (
            <button
              onClick={game.start}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {game.gameOver ? 'Play Again' : 'Start Game'}
            </button>
          ) : (
            <button
              onClick={game.togglePause}
              className="rounded-lg border border-border/50 bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
            >
              {game.paused ? 'Resume' : 'Pause'}
            </button>
          )}

          <div className="space-y-1 text-[10px] text-[var(--text-muted)]">
            <div>Arrow keys &mdash; Move &amp; Rotate</div>
            <div>Space &mdash; Hard drop</div>
            <div>P &mdash; Pause</div>
            <div>Enter &mdash; Start / Restart</div>
          </div>

          <div className="mt-auto space-y-0.5 text-[10px] text-[var(--text-muted)]">
            <div>Games: {persisted.gamesPlayed}</div>
            <div>Total lines: {persisted.totalLinesCleared}</div>
          </div>
        </div>
      </div>

      {/* Overlay for game-over / not-started */}
      {(game.gameOver || !game.started) && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div className="rounded-xl bg-[var(--bg-surface)] p-8 text-center shadow-2xl">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              {game.gameOver ? 'Game Over' : 'Tetris'}
            </h2>
            {game.gameOver && (
              <p className="mt-2 text-lg text-[var(--accent)]">
                Score: {game.score.toLocaleString()}
              </p>
            )}
            <button
              onClick={game.start}
              className="mt-4 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {game.gameOver ? 'Play Again' : 'Start Game'}
            </button>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              or press Enter
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default TetrisApp;
