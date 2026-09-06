import { create } from 'zustand';

/** Transient native-effect errors; settings remain in the theme preset. */
export const useGlassStatusStore = create<{ error: string | null }>(() => ({ error: null }));
