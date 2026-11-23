import { create } from 'zustand';
import { preferences } from '../services/storage/preferences';

export const APPEARANCES = ['system', 'light', 'dark'];

/** Device settings. `appearance` picks the colour scheme: follow the phone, or force light or dark. */
export const usePreferencesStore = create((set) => ({
  appearance: 'system',
  hydrated: false,

  async hydrate() {
    const saved = await preferences.get('appearance');
    set({ appearance: APPEARANCES.includes(saved) ? saved : 'system', hydrated: true });
  },

  setAppearance(appearance) {
    if (!APPEARANCES.includes(appearance)) return;
    set({ appearance });
    preferences.set('appearance', appearance);
  },
}));
