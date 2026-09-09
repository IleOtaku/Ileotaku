"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/errorLogger";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Root-level React error boundary — must be a class component; there is no hook equivalent
 * of componentDidCatch. Logs every caught render error to the `errors` Firestore collection
 * via lib/errorLogger.ts (read by the Technical dashboard's Error Logs tab), then renders a
 * plain fallback instead of a blank white screen.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void logError(error, { component: "RootErrorBoundary", componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
          <h1 className="font-cinzel text-2xl text-gold">Something went wrong</h1>
          <p className="max-w-sm font-noto text-sm text-muted">
            We&apos;ve logged the issue and our team will take a look. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
