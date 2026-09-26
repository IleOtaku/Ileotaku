/**
 * Beta feedback: "Shake to Report." Pure device-motion plumbing — no React, no Firestore — so
 * ShakeReporter can stay focused on the actual UI/state wiring. Both functions are safe to import
 * on the server (Next.js SSR): `startShakeDetection` only ever touches `window` from inside the
 * event listener it registers client-side, and `requestMotionPermission` early-returns before
 * touching `DeviceMotionEvent` if it isn't defined.
 */

export interface ShakeOptions {
  /** Acceleration delta (m/s²) between two consecutive readings that counts as a shake. */
  threshold?: number;
  /** Minimum ms between two triggers, so one shake gesture can't fire the callback repeatedly. */
  timeout?: number;
  onShake: () => void;
}

/** Starts listening for a shake gesture via `devicemotion`. Returns a function that stops it. */
export function startShakeDetection({ threshold = 15, timeout = 1000, onShake }: ShakeOptions): () => void {
  if (typeof window === "undefined") return () => {};

  let lastShake = 0;
  let lastX: number | null = null;
  let lastY: number | null = null;
  let lastZ: number | null = null;

  function handleMotion(event: DeviceMotionEvent) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const { x, y, z } = acc;
    if (x == null || y == null || z == null) return;

    if (lastX === null || lastY === null || lastZ === null) {
      lastX = x;
      lastY = y;
      lastZ = z;
      return;
    }

    const deltaX = Math.abs(x - lastX);
    const deltaY = Math.abs(y - lastY);
    const deltaZ = Math.abs(z - lastZ);

    if (Math.max(deltaX, deltaY, deltaZ) > threshold && Date.now() - lastShake > timeout) {
      lastShake = Date.now();
      onShake();
    }

    lastX = x;
    lastY = y;
    lastZ = z;
  }

  window.addEventListener("devicemotion", handleMotion);
  return () => window.removeEventListener("devicemotion", handleMotion);
}

/** iOS 13+ requires an explicit, user-gesture-triggered permission prompt for DeviceMotionEvent;
 * every other platform (Android, desktop) just works, so this resolves true immediately there. */
export function requestMotionPermission(): Promise<boolean> {
  if (typeof DeviceMotionEvent === "undefined") return Promise.resolve(false);
  const requestPermission = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> })
    .requestPermission;
  if (typeof requestPermission !== "function") return Promise.resolve(true);
  return requestPermission()
    .then((state) => state === "granted")
    .catch(() => false);
}
