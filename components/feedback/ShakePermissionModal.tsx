"use client";

export interface ShakePermissionModalProps {
  onEnable: () => void;
  onDisable: () => void;
}

/**
 * Beta feedback: "Shake to Report" — the first-time popup ShakeReporter shows after 30 seconds on
 * a visitor's first visit (see its own doc comment for the exact timing/persistence rules). A
 * plain fixed overlay rather than the shared `Modal` component: this needs its own two-button,
 * no-close-X layout (the visitor must pick Enable or No thanks, not dismiss it either way).
 */
export function ShakePermissionModal({ onEnable, onDisable }: ShakePermissionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-bg2 p-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay/10">
          <span className="text-3xl">📳</span>
        </div>

        <h3 className="mb-2 text-center font-cinzel text-lg text-gold">Shake to Report</h3>

        <p className="mb-6 text-center font-noto text-sm leading-relaxed text-muted">
          Shake your phone anywhere in the app to instantly open the feedback form. Found a bug? Just shake it.
        </p>

        <div className="flex flex-col gap-2">
          <button type="button" onClick={onEnable} className="w-full rounded-xl bg-clay py-3 font-noto font-semibold text-white">
            Enable Shake to Report
          </button>
          <button type="button" onClick={onDisable} className="w-full py-2 font-noto text-sm text-muted">
            No thanks
          </button>
        </div>

        <p className="mt-3 text-center font-noto text-xs text-muted/50">You can change this anytime in Profile → Settings</p>
      </div>
    </div>
  );
}

export default ShakePermissionModal;
