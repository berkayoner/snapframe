import { create } from 'zustand';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const DURATION_MS = { success: 2600, info: 3200, error: 5200 } as const;

const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (tone, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, tone, message }] });
    window.setTimeout(() => get().dismiss(id), DURATION_MS[tone]);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message),
  info: (message: string) => useToastStore.getState().push('info', message),
};

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info } as const;

/** Bottom-center notification stack. Errors use role="alert", the rest a polite live region. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <div
            key={item.id}
            className={`toast toast--${item.tone}`}
            role={item.tone === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(item.id)}
          >
            <Icon size={16} strokeWidth={2} aria-hidden />
            <span>{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
