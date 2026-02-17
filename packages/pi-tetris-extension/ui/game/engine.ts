// Pure game logic — no React dependencies

import {
  BOARD_ROWS,
  BOARD_COLS,
  SHAPES,
  PIECE_TYPES,
  type Board,
  type Piece,
  type PieceType,
} from './types';

export function createBoard(): Board {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array<PieceType | null>(BOARD_COLS).fill(null),
  );
}

export function randomPieceType(): PieceType {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

export function createPiece(type: PieceType): Piece {
  const shape = SHAPES[type].map((row) => [...row]);
  const col = Math.floor((BOARD_COLS - shape[0].length) / 2);
  return { type, shape, row: 0, col };
}

export function rotateShape(shape: number[][]): number[][] {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated: number[][] = Array.from({ length: cols }, () =>
    Array(rows).fill(0),
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = shape[r][c];
    }
  }
  return rotated;
}

export function isValidPosition(
  board: Board,
  shape: number[][],
  row: number,
  col: number,
): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const newRow = row + r;
        const newCol = col + c;
        if (
          newRow < 0 ||
          newRow >= BOARD_ROWS ||
          newCol < 0 ||
          newCol >= BOARD_COLS
        ) {
          return false;
        }
        if (board[newRow][newCol] !== null) {
          return false;
        }
      }
    }
  }
  return true;
}

export function placePiece(board: Board, piece: Piece): Board {
  const newBoard = board.map((row) => [...row]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) {
        const boardRow = piece.row + r;
        const boardCol = piece.col + c;
        if (boardRow >= 0 && boardRow < BOARD_ROWS) {
          newBoard[boardRow][boardCol] = piece.type;
        }
      }
    }
  }
  return newBoard;
}

/** Returns [newBoard, clearedCount, clearedRowIndices] */
export function clearLines(board: Board): [Board, number, number[]] {
  const clearedRows: number[] = [];
  const remaining: (PieceType | null)[][] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    if (board[r].every((cell) => cell !== null)) {
      clearedRows.push(r);
    } else {
      remaining.push(board[r]);
    }
  }
  const cleared = BOARD_ROWS - remaining.length;
  if (cleared === 0) return [board, 0, []];
  const emptyRows: Board = Array.from({ length: cleared }, () =>
    Array<PieceType | null>(BOARD_COLS).fill(null),
  );
  return [[...emptyRows, ...remaining], cleared, clearedRows];
}

export function getGhostRow(board: Board, piece: Piece): number {
  let ghostRow = piece.row;
  while (isValidPosition(board, piece.shape, ghostRow + 1, piece.col)) {
    ghostRow++;
  }
  return ghostRow;
}

export function calculateScore(linesCleared: number, level: number): number {
  const scores = [0, 100, 300, 500, 800];
  return (scores[linesCleared] || 0) * level;
}

export function getSpeed(level: number): number {
  return Math.max(100, 1000 - (level - 1) * 80);
}
