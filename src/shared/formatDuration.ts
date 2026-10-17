// Clip length for badges. The b-roll slot is 5.0 s by default, so under a minute we show one
// decimal ("4.6s"); from a minute up it is m:ss ("1:15").
//
// Always floors, never rounds: a clip is never shown longer than it is. A 4.96 s clip reads
// "4.9s", not "5.0s", so nobody picks it for a 5.0 s slot it cannot fill. Pure.

// Float noise (4.6 stored as 4.5999999...) must not drop a tenth.
const EPSILON = 1e-6;

export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (safe >= 60) {
    const whole = Math.floor(safe + EPSILON);
    const minutes = Math.floor(whole / 60);
    const rest = String(whole % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  }
  const tenths = Math.floor(safe * 10 + EPSILON);
  // 59.96 floors to 599 tenths = "59.9s": it can never print as "60.0s".
  return `${(tenths / 10).toFixed(1)}s`;
}
