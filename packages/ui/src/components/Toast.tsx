"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useReducer,
  useEffect,
  useRef,
} from "react";
import { cva } from "class-variance-authority";
import { cn } from "../lib/utils";
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from "../icons";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

type ToastAction =
  | { type: "ADD"; toast: Toast }
  | { type: "REMOVE"; id: string };

// ─── Context ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "ADD":
      return { toasts: [...state.toasts, action.toast] };
    case "REMOVE":
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { toasts: [] });

  const dismiss = useCallback((id: string) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  const toast = useCallback((opts: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    dispatch({ type: "ADD", toast: { ...opts, id } });
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastViewport toasts={state.toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ─── Item ─────────────────────────────────────────────────────────────────────

const toastVariants = cva(
  "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 text-sm shadow-lg",
  {
    variants: {
      variant: {
        success: "border-status-active/30 bg-charcoal-800 text-charcoal-50",
        error: "border-status-rejected/30 bg-charcoal-800 text-charcoal-50",
        warning: "border-status-warning/30 bg-charcoal-800 text-charcoal-50",
        info: "border-status-system/30 bg-charcoal-800 text-charcoal-50",
      },
    },
  },
);

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const iconColorMap = {
  success: "text-status-active",
  error: "text-status-rejected",
  warning: "text-status-warning",
  info: "text-status-system",
};

const DEFAULT_DURATION = 5000;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const Icon = iconMap[toast.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const duration = toast.duration ?? DEFAULT_DURATION;
    timerRef.current = setTimeout(() => onDismiss(toast.id), duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role="status"
      className={cn(toastVariants({ variant: toast.variant }))}
    >
      <Icon
        className={cn("h-4 w-4 mt-0.5 shrink-0", iconColorMap[toast.variant])}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-charcoal-400">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-charcoal-500 hover:text-charcoal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-400 rounded"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
