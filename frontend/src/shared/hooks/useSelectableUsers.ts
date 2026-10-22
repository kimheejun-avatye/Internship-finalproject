import { useContext, useEffect } from "react";
import { UserDirectoryContext } from "../users/UserDirectoryProvider";

export function useSelectableUsers({ enabled = true, refreshOnMount = false } = {}) {
  const directory = useContext(UserDirectoryContext);
  if (!directory) throw new Error("UserDirectoryProvider is missing");
  const { ensureLoaded, refresh } = directory;
  useEffect(() => {
    let active = true;
    // StrictMode's discarded effect must not start a separate request.
    void Promise.resolve().then(() => {
      if (active && enabled) return refreshOnMount ? refresh() : ensureLoaded();
    });
    return () => { active = false; };
  }, [enabled, refreshOnMount, ensureLoaded, refresh]);
  return { ...directory, retry: refresh };
}
