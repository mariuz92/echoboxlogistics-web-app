import { useCallback, useState } from "react";

/**
 * The dashboard's explanatory panels can be hidden and shown again; the choice is kept in this browser.
 * Storage can be unavailable (private mode, blocked): the panels then just start open.
 */
export type PanelKey = "note" | "alerts" | "digest";
const STORAGE_KEY = "echobox-dashboard-panels";

function read(): Partial<Record<PanelKey, boolean>> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function usePanels() {
  const [state, setState] = useState(read);
  const isOpen = (key: PanelKey) => state[key] !== false;
  const setOpen = useCallback((key: PanelKey, open: boolean) => {
    setState((prev) => {
      const next = { ...prev, [key]: open };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* keep it for this visit only */
      }
      return next;
    });
  }, []);
  return { isOpen, setOpen };
}
