import { createContext } from 'preact';
import { useCallback, useContext, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface ToastState { message: string; actionLabel?: string; onAction?: () => void }
type Show = (t: ToastState, ms?: number) => void;

const Ctx = createContext<Show>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number>();
  const show = useCallback<Show>((t, ms = 5000) => {
    clearTimeout(timer.current);
    setToast(t);
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div class="toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              onClick={() => {
                toast.onAction?.();
                clearTimeout(timer.current);
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
