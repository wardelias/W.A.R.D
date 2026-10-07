"use client";

import { useEffect } from "react";

/** Sets <html data-hydrated="1"> once the app is interactive (used by E2E tests). */
export function HydrationMark() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);
  return null;
}
