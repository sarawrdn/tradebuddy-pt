"use client";

import { useEffect } from "react";

export function PaperTradeHeartbeat() {
  useEffect(() => {
    const check = () => fetch("/api/paper-trades").catch(() => {});
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
