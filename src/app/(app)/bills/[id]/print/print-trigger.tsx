"use client";

import { useEffect } from "react";

export function PrintTrigger() {
  useEffect(() => {
    // Blank the page title so the browser's print header (top-right) is empty.
    // The browser still shows date / URL / page number — those can only be hidden
    // in the print dialog ("More settings" → uncheck "Headers and footers").
    const prevTitle = document.title;
    document.title = "";
    const t = setTimeout(() => window.print(), 300);
    return () => {
      clearTimeout(t);
      document.title = prevTitle;
    };
  }, []);
  return null;
}
