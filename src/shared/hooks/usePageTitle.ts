import { useEffect } from "react";
import { CONFIG } from "../../config/configuration";

/** Sets the browser tab title to "<page> | <app name>". */
export function usePageTitle(page: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${page} | ${CONFIG.appName}`;
    return () => {
      document.title = previous;
    };
  }, [page]);
}
