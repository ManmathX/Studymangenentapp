import { create } from 'zustand';
import { loadData, read, setSaveErrorHandler } from '../data/db';
import { useResourceStore } from './resourceStore';
import { toast } from './toastStore';

/**
 * App state. status: 'booting' while the planner file is read, then 'ready'.
 * `onboarded` decides between first-time setup and the main app.
 */
export const useAppStore = create((set) => ({
  status: 'booting',
  onboarded: false,
  name: null,

  async bootstrap() {
    const { recovered } = await loadData();
    const { profile } = read();
    set({ status: 'ready', onboarded: Boolean(profile), name: profile?.name ?? null });
    if (recovered) toast('Your saved plan couldn’t be read, so a fresh one was started. The old file was kept on this device.', 'error');
  },

  /** Call after anything that creates or removes the profile (setup, demo, start over, restore). */
  refreshProfile() {
    useResourceStore.getState().reset();
    const { profile } = read();
    set({ onboarded: Boolean(profile), name: profile?.name ?? null });
  },
}));

setSaveErrorHandler(() => toast('Couldn’t save to this device. Free up some storage, then try again.', 'error'));
