import { useEffect } from "react";
import { activity } from "../auth.api";
import type { Expiry } from "../auth.types";

export function useSessionActivity(enabled: boolean, update: (value: Expiry) => void) {
  useEffect(() => {
    if (!enabled) return;
    let lastSent = 0;
    let inFlight = false;
    let cancelled = false;
    const notify = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== "visible" || inFlight || Date.now() - lastSent < 60_000) return;
      lastSent = Date.now(); inFlight = true;
      void activity().then(value => { if (!cancelled) update(value); }).catch(() => { /* Shared client handles expired sessions. */ }).finally(() => { inFlight = false; });
    };
    for (const name of ["pointerdown", "keydown", "input"]) window.addEventListener(name, notify, { passive: true });
    return () => { cancelled = true; for (const name of ["pointerdown", "keydown", "input"]) window.removeEventListener(name, notify); };
  }, [enabled, update]);
}
