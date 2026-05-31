import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastState {
  message: string;
  kind: ToastKind;
  show: boolean;
  _timer: ReturnType<typeof setTimeout> | null;
  toast: (message: string, kind?: ToastKind) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  message: '',
  kind: 'info',
  show: false,
  _timer: null,
  toast: (message, kind = 'info') => {
    const prev = get()._timer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => set({ show: false }), 3200);
    set({ message, kind, show: true, _timer: timer });
  },
}));

// Convenience for non-React modules (engine/lib code) — mirrors the prototype's
// global toast() so ported logic can call it verbatim.
export const toast = (message: string, kind: ToastKind = 'info') =>
  useToastStore.getState().toast(message, kind);
