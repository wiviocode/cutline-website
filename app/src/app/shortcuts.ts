/**
 * Keyboard shortcuts, declared per screen. A plain key never fires while focus is in something
 * that uses keys itself — an input, a textarea, a select, a button, a link — so Return on a
 * focused Stop button presses Stop and nothing else. Modifier shortcuts (⌘O) fire anywhere.
 *
 * Keys are named as `KeyboardEvent.key`, with `mod+` for ⌘ on a Mac and Ctrl elsewhere.
 */

import { useEffect, useRef } from "react";

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

const EDITABLE = "input, textarea, select, button, a, [contenteditable=''], [contenteditable='true']";

export function useShortcuts(map: ShortcutMap, enabled = true) {
  const latest = useRef(map);
  latest.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const name = (mod ? "mod+" : "") + (e.key.length === 1 && !mod ? e.key : e.key);
      const handler = latest.current[name];
      if (!handler) return;
      if (!mod) {
        const t = e.target as HTMLElement | null;
        if (t && typeof t.closest === "function" && t.closest(EDITABLE)) return;
      }
      e.preventDefault();
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
