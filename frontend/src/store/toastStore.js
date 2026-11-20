import { create } from 'zustand';

let hideTimer = null;

export const useToastStore = create((set) => ({
  message: null,
  tone: 'default',
  show(message, tone = 'default') {
    clearTimeout(hideTimer);
    set({ message, tone });
    hideTimer = setTimeout(() => set({ message: null }), 2800);
  },
  hide() {
    clearTimeout(hideTimer);
    set({ message: null });
  },
}));

export const toast = (message, tone) => useToastStore.getState().show(message, tone);
