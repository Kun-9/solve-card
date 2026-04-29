import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setPending((cur) => {
      if (!cur) return null;
      cur.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="cd-backdrop"
          onClick={() => close(false)}
          aria-hidden={false}
        >
          <div
            className="cd-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={pending.title ? "cd-title" : undefined}
            aria-describedby="cd-message"
            onClick={(e) => e.stopPropagation()}
          >
            {pending.title && (
              <h2 id="cd-title" className="cd-title">
                {pending.title}
              </h2>
            )}
            <p id="cd-message" className="cd-message">
              {pending.message}
            </p>
            <div className="cd-actions">
              <button
                type="button"
                className="btn btn-ghost cd-btn"
                onClick={() => close(false)}
              >
                {pending.cancelLabel ?? "취소"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className={`btn cd-btn ${
                  pending.variant === "danger" ? "btn-danger" : "btn-primary"
                }`}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}
