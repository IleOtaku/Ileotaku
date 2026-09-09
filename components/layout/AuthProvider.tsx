"use client";

import { useEffect } from "react";
import { initAuthListener } from "@/hooks/useAuth";

/** Boots the Firebase auth listener on the client so the Zustand auth store stays in sync app-wide. */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAuthListener();
  }, []);

  return <>{children}</>;
}
