"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  // Assume desktop until measured so SSR + first paint avoid overlaying content under a fixed sidebar.
  const [matches, setMatches] = useState(true);

  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setMatches(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [query]);

  return matches;
}
