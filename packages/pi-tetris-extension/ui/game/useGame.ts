// React hook managing Tetris game state and loop

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameState } from './types';
import { PIECE_COLORS, BOARD_COLS, type PieceType } from './types';
import {
  createBoard,
  createPiece,
  randomPieceType,
  rotateShape,
  isValidPosition,
  placePiece,
  clearLines,
  getGhostRow,
  calculateScore,
  getSpeed,
} from './engine';

// ── Particle event types ──────────────────────────────────────────
export interface ParticleEvent {
  type: 'lineClear' | 'hardDrop' | 'pieceLock' | 'gameOver' | 'levelUp';
  rows?: number[];           // cleared row indices
  linesCleared?: number;     // how many lines
  piece?: { type: PieceType; row: number; col: number; shape: number[][] };
  combo?: number;            // consecutive clears
  level?: number;
}

type ParticleEventCallback = (event: ParticleEvent) => void;

function createInitialState(): GameState {
  return {
    board: createBoard(),
    currentPiece: null,
    nextType: randomPieceType(),
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false,
    paused: false,
    started: false,
  };
}

export function useGame(
  onParticleEvent?: ParticleEventCallback,
  containerRef?: React.RefObject<HTMLElement | null>,
) {
  const [state, setState] = useState<GameState>(createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const comboRef = useRef(0);
  const onParticleEventRef = useRef(onParticleEvent);
  onParticleEventRef.current = onParticleEvent;

  const emitEvent = useCallback((event: ParticleEvent) => {
    onParticleEventRef.current?.(event);
  }, []);

  const spawnPiece = useCallback((s: GameState): GameState => {
    const piece = createPiece(s.nextType);
    if (!isValidPosition(s.board, piece.shape, piece.row, piece.col)) {
      return { ...s, gameOver: true, currentPiece: null };
    }
    return { ...s, currentPiece: piece, nextType: randomPieceType() };
  }, []);

  const lockPiece = useCallback(
    (s: GameState): GameState => {
      if (!s.currentPiece) return s;

      // Emit piece lock event
      emitEvent({
        type: 'pieceLock',
        piece: {
          type: s.currentPiece.type,
          row: s.currentPiece.row,
          col: s.currentPiece.col,
          shape: s.currentPiece.shape,
        },
      });

      const newBoard = placePiece(s.board, s.currentPiece);
      const [clearedBoard, linesCleared, clearedRows] = clearLines(newBoard);
      const newLines = s.lines + linesCleared;
      const newLevel = Math.floor(newLines / 10) + 1;
      const newScore = s.score + calculateScore(linesCleared, s.level);

      if (linesCleared > 0) {
        comboRef.current++;

        // Capture row colors before they're cleared for particle effects
        const rowColors: string[][] = clearedRows.map((rowIdx) =>
          newBoard[rowIdx].map((cell) => (cell ? PIECE_COLORS[cell] : '#ffffff')),
        );

        emitEvent({
          type: 'lineClear',
          rows: clearedRows,
          linesCleared,
          combo: comboRef.current,
          piece: {
            type: s.currentPiece.type,
            row: s.currentPiece.row,
            col: s.currentPiece.col,
            shape: s.currentPiece.shape,
          },
        });

        // Store row colors for the particle system to use
        (emitEvent as any)._lastRowColors = rowColors;
      } else {
        comboRef.current = 0;
      }

      // Level up event
      if (newLevel > s.level) {
        emitEvent({ type: 'levelUp', level: newLevel });
      }

      const next = spawnPiece({
        ...s,
        board: clearedBoard,
        currentPiece: null,
        score: newScore,
        level: newLevel,
        lines: newLines,
      });

      if (next.gameOver) {
        emitEvent({ type: 'gameOver' });
        comboRef.current = 0;
      }

      return next;
    },
    [spawnPiece, emitEvent],
  );

  const moveDown = useCallback(() => {
    setState((s) => {
      if (!s.currentPiece || s.gameOver || s.paused) return s;
      if (
        isValidPosition(
          s.board,
          s.currentPiece.shape,
          s.currentPiece.row + 1,
          s.currentPiece.col,
        )
      ) {
        return {
          ...s,
          currentPiece: { ...s.currentPiece, row: s.currentPiece.row + 1 },
        };
      }
      return lockPiece(s);
    });
  }, [lockPiece]);

  const moveLeft = useCallback(() => {
    setState((s) => {
      if (!s.currentPiece || s.gameOver || s.paused) return s;
      if (
        isValidPosition(
          s.board,
          s.currentPiece.shape,
          s.currentPiece.row,
          s.currentPiece.col - 1,
        )
      ) {
        return {
          ...s,
          currentPiece: { ...s.currentPiece, col: s.currentPiece.col - 1 },
        };
      }
      return s;
    });
  }, []);

  const moveRight = useCallback(() => {
    setState((s) => {
      if (!s.currentPiece || s.gameOver || s.paused) return s;
      if (
        isValidPosition(
          s.board,
          s.currentPiece.shape,
          s.currentPiece.row,
          s.currentPiece.col + 1,
        )
      ) {
        return {
          ...s,
          currentPiece: { ...s.currentPiece, col: s.currentPiece.col + 1 },
        };
      }
      return s;
    });
  }, []);

  const rotate = useCallback(() => {
    setState((s) => {
      if (!s.currentPiece || s.gameOver || s.paused) return s;
      const newShape = rotateShape(s.currentPiece.shape);
      const kicks = [0, -1, 1, -2, 2];
      for (const kick of kicks) {
        if (
          isValidPosition(
            s.board,
            newShape,
            s.currentPiece.row,
            s.currentPiece.col + kick,
          )
        ) {
          return {
            ...s,
            currentPiece: {
              ...s.currentPiece,
              shape: newShape,
              col: s.currentPiece.col + kick,
            },
          };
        }
      }
      return s;
    });
  }, []);

  const hardDrop = useCallback(() => {
    setState((s) => {
      if (!s.currentPiece || s.gameOver || s.paused) return s;
      const ghostRow = getGhostRow(s.board, s.currentPiece);
      const dropBonus = (ghostRow - s.currentPiece.row) * 2;

      // Emit hard drop event
      emitEvent({
        type: 'hardDrop',
        piece: {
          type: s.currentPiece.type,
          row: ghostRow,
          col: s.currentPiece.col,
          shape: s.currentPiece.shape,
        },
      });

      return lockPiece({
        ...s,
        currentPiece: { ...s.currentPiece, row: ghostRow },
        score: s.score + dropBonus,
      });
    });
  }, [lockPiece, emitEvent]);

  const start = useCallback(() => {
    comboRef.current = 0;
    const initial = createInitialState();
    setState(spawnPiece({ ...initial, started: true }));
  }, [spawnPiece]);

  const togglePause = useCallback(() => {
    setState((s) => {
      if (s.gameOver || !s.started) return s;
      return { ...s, paused: !s.paused };
    });
  }, []);

  // Game loop timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (state.started && !state.gameOver && !state.paused) {
      timerRef.current = setInterval(moveDown, getSpeed(state.level));
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.started, state.gameOver, state.paused, state.level, moveDown]);

  // Keyboard controls — scoped to container so they don't steal from other panels
  useEffect(() => {
    const target = containerRef?.current ?? window;
    const handleKey = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(
          ke.key,
        )
      ) {
        ke.preventDefault();
      }
      switch (ke.key) {
        case 'ArrowLeft':
          moveLeft();
          break;
        case 'ArrowRight':
          moveRight();
          break;
        case 'ArrowDown':
          moveDown();
          break;
        case 'ArrowUp':
          rotate();
          break;
        case ' ':
          hardDrop();
          break;
        case 'p':
        case 'P':
          togglePause();
          break;
        case 'Enter':
          if (stateRef.current.gameOver || !stateRef.current.started) start();
          break;
      }
    };
    target.addEventListener('keydown', handleKey);
    return () => target.removeEventListener('keydown', handleKey);
  }, [moveLeft, moveRight, moveDown, rotate, hardDrop, togglePause, start, containerRef]);

  const ghostRow = state.currentPiece
    ? getGhostRow(state.board, state.currentPiece)
    : 0;

  return { ...state, ghostRow, start, togglePause };
}
