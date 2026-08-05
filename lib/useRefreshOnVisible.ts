import { useEffect } from "react";

/**
 * Re-run `refresh` whenever the tab becomes visible or regains focus, so a
 * dashboard left open in a background tab shows fresh data the moment you come
 * back instead of whatever it fetched on mount. Pass a STABLE callback
 * (useCallback) to avoid re-subscribing every render.
 */
export function useRefreshOnVisible(refresh: () => void) {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);
}
