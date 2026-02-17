// Game constants, piece definitions, and in-memory types

export const BOARD_ROWS = 20;
export const BOARD_COLS = 10;
export const CELL_SIZE = 28;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#00d4d4',
  O: '#d4d400',
  T: '#9b59b6',
  S: '#2ecc71',
  Z: '#e74c3c',
  J: '#3498db',
  L: '#e67e22',
};

export type Board = (PieceType | null)[][];

export interface Piece {
  type: PieceType;
  shape: number[][];
  row: number;
  col: number;
}

export interface GameState {
  board: Board;
  currentPiece: Piece | null;
  nextType: PieceType;
  score: number;
  level: number;
  lines: number;
  gameOver: boolean;
  paused: boolean;
  started: boolean;
}
