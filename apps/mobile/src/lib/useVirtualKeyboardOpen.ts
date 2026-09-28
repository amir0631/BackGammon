"use client";

import { useEffect, useState } from "react";

// Detects the on-screen keyboard so the bottom nav can step aside (ia.md §3.1).
// Heuristic: an editable element has focus and the visual viewport is much shorter than the
// tallest layout height seen without the keyboard.

/** A keyboard takes far more than this; browser toolbars collapsing take less. */
const KEYBOARD_MIN_HEIGHT_PX = 150;

function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(el.type);
  }
  return false;
}

export function useVirtualKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let baseline = window.innerHeight;

    const update = () => {
      const editable = isEditable(document.activeElement);
      if (!editable) baseline = Math.max(window.innerHeight, vv.height);
      setOpen(editable && baseline - vv.height > KEYBOARD_MIN_HEIGHT_PX);
    };
    const reset = () => {
      baseline = window.innerHeight;
      update();
    };

    vv.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.addEventListener("orientationchange", reset);
    return () => {
      vv.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.removeEventListener("orientationchange", reset);
    };
  }, []);

  return open;
}
