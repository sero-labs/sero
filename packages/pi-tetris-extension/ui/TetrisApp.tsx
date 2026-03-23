// ui/TetrisApp.tsx — Main Tetris component with HD particle effects

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { TetrisState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { useGame, type ParticleEvent } from './game/useGame';
import {
  BOARD_ROWS,
  BOARD_COLS,
  PIECE_COLORS,
  SHAPES,
  type PieceType,
} from './game/types';
import { ParticleEngine } from './game/particles';

// ── Helpers ────────────────────────────────────────────────────────

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
): { color: string; opacity: number; type: PieceType } | null {
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
      return { color: PIECE_COLORS[currentPiece.type], opacity: 1, type: currentPiece.type };
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
      return { color: PIECE_COLORS[currentPiece.type], opacity: 0.2, type: currentPiece.type };
    }
  }
  const cell = board[row]?.[col];
  if (cell) return { color: PIECE_COLORS[cell], opacity: 1, type: cell };
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
                boxShadow: cell ? `0 0 6px ${color}44, inset 0 1px 0 rgba(255,255,255,0.15)` : 'none',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const INFO_PANEL_WIDTH = 160;
const GAP = 24;
const BOARD_PADDING = 4;
const BOARD_BORDER = 4;
const BOARD_OVERHEAD = BOARD_PADDING + BOARD_BORDER;

function useDynamicCellSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(28);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = el.clientHeight - 48;
    const w = el.clientWidth - 64;
    const fromHeight = (h - BOARD_OVERHEAD - (BOARD_ROWS - 1)) / BOARD_ROWS;
    const fromWidth =
      (w - INFO_PANEL_WIDTH - GAP - BOARD_OVERHEAD - (BOARD_COLS - 1)) /
      BOARD_COLS;
    setCellSize(Math.max(12, Math.floor(Math.min(fromHeight, fromWidth))));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return { containerRef, cellSize };
}

// ── Flash overlay for line clears ──────────────────────────────────

interface FlashState {
  rows: number[];
  startTime: number;
  color: string;
}

// ── Main Component ─────────────────────────────────────────────────

export function TetrisApp() {
  const [persisted, updatePersisted] = useAppState<TetrisState>(DEFAULT_STATE);
  const prevGameOver = useRef(false);
  const { containerRef, cellSize } = useDynamicCellSize();

  // Particle engine (one instance for the lifetime of the component)
  const engineRef = useRef<ParticleEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Flash state for line clear white-out effect
  const [flashes, setFlashes] = useState<FlashState[]>([]);

  // Screen shake state
  const [shake, setShake] = useState({ x: 0, y: 0 });
  const shakeFrameRef = useRef(0);

  // Combo text popup
  const [comboText, setComboText] = useState<{ text: string; key: number } | null>(null);
  const comboKeyRef = useRef(0);

  // Auto-focus container so keyboard works immediately
  useEffect(() => {
    containerRef.current?.focus();
  }, [containerRef]);

  // ── Initialize particle engine ──────────────────────────────────
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new ParticleEngine();
    }
    const canvas = canvasRef.current;
    if (canvas && engineRef.current) {
      engineRef.current.attach(canvas);
    }
    return () => {
      engineRef.current?.detach();
    };
  }, []);

  // ── Resize particle canvas to match board ───────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    const board = boardRef.current;
    const canvas = canvasRef.current;
    if (!engine || !board || !canvas) return;

    const ro = new ResizeObserver(() => {
      const rect = board.getBoundingClientRect();
      // Make canvas slightly larger for particles that fly out
      const pad = 80;
      engine.resize(rect.width + pad * 2, rect.height + pad * 2);
      canvas.style.position = 'absolute';
      canvas.style.left = `${-pad}px`;
      canvas.style.top = `${-pad}px`;
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '10';
    });
    ro.observe(board);
    return () => ro.disconnect();
  }, [cellSize]);

  // ── Screen shake animation ──────────────────────────────────────
  useEffect(() => {
    let frame: number;
    const tick = () => {
      const engine = engineRef.current;
      if (engine && (engine.shakeX !== 0 || engine.shakeY !== 0)) {
        setShake({ x: engine.shakeX, y: engine.shakeY });
      } else if (shake.x !== 0 || shake.y !== 0) {
        setShake({ x: 0, y: 0 });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // ── Convert board coords to canvas pixel coords ─────────────────
  const boardToCanvas = useCallback(
    (row: number, col: number) => {
      const pad = 80;
      const gap = 1;
      const x = pad + 2 + col * (cellSize + gap) + cellSize / 2;
      const y = pad + 2 + row * (cellSize + gap) + cellSize / 2;
      return { x, y };
    },
    [cellSize],
  );

  // ── Handle particle events from game engine ─────────────────────
  const handleParticleEvent = useCallback(
    (event: ParticleEvent) => {
      const engine = engineRef.current;
      if (!engine) return;

      switch (event.type) {
        case 'lineClear': {
          const rows = event.rows || [];
          const linesCleared = event.linesCleared || 0;
          const combo = event.combo || 0;
          const isTetris = linesCleared === 4;
          const preset = isTetris ? 'tetris' as const : 'lineClear' as const;
          const intensity = isTetris ? 2.5 : (1 + combo * 0.3);

          // Emit particles along each cleared row
          for (const rowIdx of rows) {
            for (let col = 0; col < BOARD_COLS; col++) {
              const { x, y } = boardToCanvas(rowIdx, col);
              engine.emit({
                x, y,
                count: isTetris ? 18 : 8,
                preset,
                color: PIECE_COLORS[(['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as PieceType[])[col % 7]],
                intensity,
              });
            }
          }

          // Extra center burst for tetris
          if (isTetris) {
            const centerRow = rows[Math.floor(rows.length / 2)];
            const { x, y } = boardToCanvas(centerRow, BOARD_COLS / 2);
            engine.emit({
              x, y,
              count: 60,
              preset: 'tetris',
              color: '#ffd700',
              intensity: 3,
            });
          }

          // Combo particles
          if (combo >= 2) {
            const centerRow = rows[Math.floor(rows.length / 2)];
            const { x, y } = boardToCanvas(centerRow, BOARD_COLS / 2);
            engine.emit({
              x, y,
              count: 30 * combo,
              preset: 'combo',
              color: '#ffd700',
              intensity: 1 + combo * 0.5,
            });

            // Combo text
            comboKeyRef.current++;
            const texts = ['', '', 'COMBO x2!', 'COMBO x3!', 'COMBO x4!', 'INSANE x5!'];
            setComboText({
              text: combo >= 5 ? `INSANE x${combo}!` : (texts[combo] || `COMBO x${combo}!`),
              key: comboKeyRef.current,
            });
            setTimeout(() => setComboText(null), 1500);
          }

          // Screen shake
          engine.shake(isTetris ? 20 : 8 + combo * 3, isTetris ? 8 : 3 + combo);

          // Flash effect
          setFlashes((prev) => [
            ...prev,
            { rows, startTime: Date.now(), color: isTetris ? '#ffd700' : '#ffffff' },
          ]);
          setTimeout(() => {
            setFlashes((prev) => prev.filter((f) => Date.now() - f.startTime < 400));
          }, 450);

          break;
        }

        case 'hardDrop': {
          if (!event.piece) break;
          const { shape, row, col, type } = event.piece;
          const color = PIECE_COLORS[type];

          // Find bottom cells of the piece (impact points)
          const bottomCells: { r: number; c: number }[] = [];
          for (let c = 0; c < shape[0].length; c++) {
            for (let r = shape.length - 1; r >= 0; r--) {
              if (shape[r][c]) {
                bottomCells.push({ r: row + r, c: col + c });
                break;
              }
            }
          }

          // Emit impact particles from bottom of piece
          for (const cell of bottomCells) {
            const { x, y } = boardToCanvas(cell.r, cell.c);
            engine.emit({
              x, y: y + cellSize / 2,
              count: 15,
              preset: 'hardDrop',
              color,
              intensity: 1.2,
            });
          }

          // Shockwave particles along the landing row
          const landingRow = Math.max(...bottomCells.map((c) => c.r));
          for (let c = 0; c < BOARD_COLS; c++) {
            const { x, y } = boardToCanvas(landingRow, c);
            engine.emit({
              x, y: y + cellSize / 3,
              count: 2,
              preset: 'hardDrop',
              color: '#ffffff',
              intensity: 0.4,
            });
          }

          engine.shake(6, 3);
          break;
        }

        case 'pieceLock': {
          if (!event.piece) break;
          const { shape, row, col, type } = event.piece;
          const color = PIECE_COLORS[type];

          for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
              if (shape[r][c]) {
                const { x, y } = boardToCanvas(row + r, col + c);
                engine.emit({
                  x, y,
                  count: 4,
                  preset: 'pieceLock',
                  color,
                  intensity: 0.8,
                });
              }
            }
          }
          break;
        }

        case 'gameOver': {
          // Dramatic cascade of particles from the top
          for (let row = 0; row < BOARD_ROWS; row++) {
            setTimeout(() => {
              for (let col = 0; col < BOARD_COLS; col++) {
                const { x, y } = boardToCanvas(row, col);
                engine.emit({
                  x, y,
                  count: 5,
                  preset: 'gameOver',
                  intensity: 1.2,
                });
              }
            }, row * 40);
          }
          engine.shake(30, 6);
          break;
        }

        case 'levelUp': {
          // Firework-style burst from center
          const { x, y } = boardToCanvas(BOARD_ROWS / 2, BOARD_COLS / 2);
          engine.emit({
            x, y,
            count: 120,
            preset: 'levelUp',
            intensity: 2,
          });

          // Corner bursts
          for (const [r, c] of [[0, 0], [0, BOARD_COLS - 1], [BOARD_ROWS - 1, 0], [BOARD_ROWS - 1, BOARD_COLS - 1]]) {
            const pos = boardToCanvas(r, c);
            engine.emit({
              x: pos.x, y: pos.y,
              count: 30,
              preset: 'levelUp',
              intensity: 1.5,
            });
          }

          engine.shake(15, 4);
          break;
        }
      }
    },
    [boardToCanvas, cellSize],
  );

  // ── Ambient particles ───────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      // Spawn a few ambient particles around the board
      for (let i = 0; i < 2; i++) {
        const row = Math.random() * BOARD_ROWS;
        const col = Math.random() * BOARD_COLS;
        const { x, y } = boardToCanvas(row, col);
        engine.emit({
          x, y,
          count: 1,
          preset: 'ambient',
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [boardToCanvas]);

  const game = useGame(handleParticleEvent, containerRef);

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
    const result: ({ color: string; opacity: number; type: PieceType } | null)[][] = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      const row: ({ color: string; opacity: number; type: PieceType } | null)[] = [];
      for (let c = 0; c < BOARD_COLS; c++) {
        row.push(getCellDisplay(r, c, game.board, game.currentPiece, game.ghostRow));
      }
      result.push(row);
    }
    return result;
  }, [game.board, game.currentPiece, game.ghostRow]);

  // Determine which rows are currently flashing
  const flashingRows = useMemo(() => {
    const set = new Set<number>();
    const now = Date.now();
    for (const f of flashes) {
      if (now - f.startTime < 400) {
        for (const r of f.rows) set.add(r);
      }
    }
    return set;
  }, [flashes]);

  const boardWidth = BOARD_COLS * (cellSize + 1) - 1 + BOARD_OVERHEAD;
  const boardHeight = BOARD_ROWS * (cellSize + 1) - 1 + BOARD_OVERHEAD;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative flex h-full w-full items-center justify-center bg-[var(--bg-base)] outline-none"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
      onFocus={(e) => {
        // Keep focus on container even when clicking children
        if (e.target !== containerRef.current) containerRef.current?.focus();
      }}
    >
      <div className="flex items-center" style={{ gap: GAP }}>
        {/* Board Wrapper with shake and particle canvas */}
        <div
          style={{
            position: 'relative',
            transform: `translate(${shake.x}px, ${shake.y}px)`,
            transition: shake.x === 0 && shake.y === 0 ? 'transform 0.1s ease-out' : 'none',
          }}
        >
          {/* Particle Canvas (positioned absolutely over board) */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />

          {/* Combo text popup */}
          {comboText && (
            <div
              key={comboText.key}
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 20,
                fontSize: 28,
                fontWeight: 900,
                color: '#ffd700',
                textShadow: '0 0 20px #ffd70088, 0 0 40px #ffd70044, 0 2px 4px rgba(0,0,0,0.8)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                animation: 'comboPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1), comboFadeOut 0.5s 1s ease-out forwards',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {comboText.text}
            </div>
          )}

          {/* Game Board */}
          <div
            ref={boardRef}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${BOARD_COLS}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${BOARD_ROWS}, ${cellSize}px)`,
              gap: 1,
              padding: 2,
              backgroundColor: '#0a0b0f',
              borderRadius: 8,
              border: '2px solid rgba(255,255,255,0.08)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {cells.flat().map((cell, i) => {
              const row = Math.floor(i / BOARD_COLS);
              const isFlashing = flashingRows.has(row);
              return (
                <div
                  key={i}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 3,
                    backgroundColor: isFlashing
                      ? '#ffffff'
                      : cell
                        ? cell.color
                        : 'rgba(255,255,255,0.03)',
                    opacity: isFlashing ? 0.9 : cell ? cell.opacity : 1,
                    boxShadow: cell && cell.opacity === 1
                      ? `0 0 ${cellSize * 0.4}px ${cell.color}33, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.3)`
                      : 'none',
                    transition: isFlashing ? 'background-color 0.1s, opacity 0.1s' : 'none',
                  }}
                />
              );
            })}

            {/* Scanline overlay for retro feel */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.03) 1px, rgba(0,0,0,0.03) 2px)',
                pointerEvents: 'none',
                borderRadius: 6,
              }}
            />
          </div>
        </div>

        {/* Info Panel */}
        <div className="flex flex-col gap-4" style={{ width: INFO_PANEL_WIDTH }}>
          <div className="rounded-lg bg-[var(--bg-surface)] p-3">
            <div className="text-xs text-[var(--text-muted)]">Score</div>
            <div
              className="text-xl font-bold text-[var(--text-primary)]"
              style={{
                textShadow: game.score > 0 ? '0 0 8px rgba(212,164,76,0.3)' : 'none',
              }}
            >
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
            <div
              className="text-lg font-bold text-[var(--accent)]"
              style={{ textShadow: '0 0 8px rgba(212,164,76,0.2)' }}
            >
              {persisted.highScore.toLocaleString()}
            </div>
          </div>

          {!game.started || game.gameOver ? (
            <button
              onClick={game.start}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{
                boxShadow: '0 0 20px rgba(212,164,76,0.2), 0 4px 12px rgba(0,0,0,0.3)',
              }}
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
              className="mt-4 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{
                boxShadow: '0 0 20px rgba(212,164,76,0.3)',
              }}
            >
              {game.gameOver ? 'Play Again' : 'Start Game'}
            </button>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              or press Enter
            </p>
          </div>
        </div>
      )}

      {/* Inline keyframe animations */}
      <style>{`
        @keyframes comboPopIn {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes comboFadeOut {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -60%) scale(1.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default TetrisApp;
