// shared/types.ts — persisted state (high scores, stats)

export interface TetrisState {
  highScore: number;
  gamesPlayed: number;
  totalLinesCleared: number;
}

export const DEFAULT_STATE: TetrisState = {
  highScore: 0,
  gamesPlayed: 0,
  totalLinesCleared: 0,
};
