import type { PlayerRef } from "@remotion/player";
import { useEffect, useState } from "react";

const BUTTON =
  "rounded-md border border-edge px-3 py-1.5 text-xs transition-colors hover:bg-white/5";

function clock(frame: number, fps: number): string {
  return (frame / fps).toFixed(1) + "s";
}

// Play/pause, scrubber and loop. It listens to the Player itself, so a frame tick
// re-renders only this component and never the Player's parent.
export const PlayerControls: React.FC<{
  player: React.RefObject<PlayerRef | null>;
  // The Player is mounted. It appears a render after this component (once its box has been
  // measured), so the subscription below has to wait for it.
  attached: boolean;
  totalFrames: number;
  fps: number;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
}> = ({ player, attached, totalFrames, fps, loop, onLoopChange }) => {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const current = player.current;
    if (!attached || !current) {
      return;
    }
    const onFrame = (event: { detail: { frame: number } }) =>
      setFrame(event.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    current.addEventListener("frameupdate", onFrame);
    current.addEventListener("play", onPlay);
    current.addEventListener("pause", onPause);
    current.addEventListener("ended", onPause);
    setFrame(current.getCurrentFrame());
    setPlaying(current.isPlaying());
    return () => {
      current.removeEventListener("frameupdate", onFrame);
      current.removeEventListener("play", onPlay);
      current.removeEventListener("pause", onPause);
      current.removeEventListener("ended", onPause);
    };
  }, [player, attached]);

  const last = Math.max(0, totalFrames - 1);
  const shown = Math.min(frame, last);

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="player-controls"
    >
      <button
        type="button"
        className={BUTTON}
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => player.current?.toggle()}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        aria-label="Scrub preview"
        data-testid="scrubber"
        className="order-last w-full min-w-0 accent-brand"
        min={0}
        max={last}
        step={1}
        value={shown}
        onChange={(event) => {
          const next = Number(event.target.value);
          player.current?.seekTo(next);
          setFrame(next);
        }}
      />
      <span className="w-20 text-right text-xs tabular-nums text-app-muted">
        {clock(shown, fps)} / {clock(totalFrames, fps)}
      </span>
      <label className="flex items-center gap-1.5 text-xs text-app-muted">
        <input
          type="checkbox"
          checked={loop}
          onChange={(event) => onLoopChange(event.target.checked)}
        />
        Loop
      </label>
    </div>
  );
};
