"use client";

import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { feedbackTiming, layout, space } from "@bg/design-tokens";
import { bottomInset } from "@/theme/layout";

// Snackbar / toast (patterns.md §1): confirmation of a completed, non-critical action.
// Auto-hides after 4 s (8 s with an action); pauses on hover and while focused. Sits above the
// bottom nav and never covers primary game controls (screens with game controls pass
// `bottomOffset`). Not for errors that need action, and nothing in a match except reactions.

export interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastState extends ToastOptions {
  key: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children, bottomOffset }: { children: ReactNode; bottomOffset?: string }) {
  const [queue, setQueue] = useState<ToastState[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const current = queue[0];

  const show = useCallback((options: ToastOptions) => {
    setQueue((q) => [...q, { ...options, key: Date.now() + Math.random() }]);
    setOpen(true);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  const handleClose = (_: unknown, reason?: string) => {
    if (reason === "clickaway") return;
    setOpen(false);
  };

  const handleExited = () => {
    setQueue((q) => {
      const rest = q.slice(1);
      if (rest.length > 0) setOpen(true);
      return rest;
    });
    setFocused(false);
  };

  const duration = current?.action ? feedbackTiming.toastWithActionMs : feedbackTiming.toastMs;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={current?.key}
        open={open && Boolean(current)}
        onClose={handleClose}
        // MUI pauses on hover and window blur; we also pause while keyboard focus is inside.
        autoHideDuration={focused ? null : duration}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={current?.message}
        action={
          current?.action ? (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                current.action?.onClick();
                setOpen(false);
              }}
            >
              {current.action.label}
            </Button>
          ) : undefined
        }
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        slotProps={{
          transition: { onExited: handleExited },
          content: { role: "status" },
        }}
        sx={{
          // Logical insets + flex centering instead of MUI's left:50%/translateX, which the RTL
          // stylis plugin would flip into an off-center position.
          bottom: `calc(${bottomOffset ?? bottomInset} + ${space.sm}px)`,
          insetInline: space.sm,
          transform: "none",
          maxWidth: layout.dialogMaxWidth,
          marginInline: "auto",
        }}
      />
    </ToastContext.Provider>
  );
}
