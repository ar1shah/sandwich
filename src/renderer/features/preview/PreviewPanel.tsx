import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import { SandwichVideo } from "../../../../remotion/SandwichVideo";
import type { SandwichProps } from "../../../../remotion/types";
import { buildPreviewPlan } from "../../../shared/previewRecipe";
import { buildTimeline, slotStartFrame } from "../../../shared/timeline";
import { useProductsStore } from "../products/productsStore";
import { useEditorStore } from "../editor/editorStore";
import { LengthIndicator } from "./LengthIndicator";
import { PlayerControls } from "./PlayerControls";
import { usePreviewStore } from "./previewStore";

const ASPECT = 9 / 16;

// Largest 9:16 box that fits the area, tracked with a ResizeObserver.
function useFitBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const { clientWidth, clientHeight } = element;
      const width = Math.floor(Math.min(clientWidth, clientHeight * ASPECT));
      setBox({ width, height: Math.floor(width / ASPECT) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, box };
}

// The same <SandwichVideo> the export renders (golden rule 2), played in the Player.
export const PreviewPanel: React.FC = () => {
  const draft = useEditorStore((s) => s.draft);
  const missing = useEditorStore((s) => s.missing);
  const mediaBaseUrl = useProductsStore((s) => s.mediaBase);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [loop, setLoop] = useState(true);
  const player = useRef<PlayerRef>(null);
  const { ref: area, box } = useFitBox();

  // Memoized in two steps: the plan only changes when the draft or the missing flags do,
  // and inputProps only when the plan, the media base or the overlay toggle does. A new
  // inputProps object restarts the Player's props, so unrelated store updates (import
  // progress, notices) must never produce one.
  const plan = useMemo(
    () => (draft ? buildPreviewPlan(draft, missing) : null),
    [draft, missing],
  );
  const inputProps = useMemo<SandwichProps | null>(
    () =>
      plan && mediaBaseUrl
        ? {
            recipe: plan.recipe,
            mediaBaseUrl,
            showSafeZone,
            placeholders: plan.placeholders,
          }
        : null,
    [plan, mediaBaseUrl, showSafeZone],
  );
  const timeline = useMemo(
    () => (draft ? buildTimeline(draft, draft.output.fps) : null),
    [draft],
  );

  // Seek requests from the slot cards and the trim drag. Requests made before this panel
  // mounted are not replayed. The timeline is rebuilt from the store's draft right now,
  // not taken from this render: a trim change and its seek can land in different renders,
  // and the end of a clip depends on the new length.
  const handled = useRef(usePreviewStore.getState().seekRequest?.nonce ?? 0);
  const seekRequest = usePreviewStore((s) => s.seekRequest);
  useEffect(() => {
    const latest = useEditorStore.getState().draft;
    if (!seekRequest || seekRequest.nonce === handled.current || !latest) {
      return;
    }
    handled.current = seekRequest.nonce;
    const current = buildTimeline(latest, latest.output.fps);
    const { target } = seekRequest;
    let frame: number;
    if ("slot" in target) {
      const clip = current.clips.find((entry) => entry.slot === target.slot);
      frame =
        target.edge === "end" && clip
          ? clip.from + clip.durationInFrames - 1
          : slotStartFrame(current, target.slot);
    } else {
      frame = target.frame;
    }
    if (seekRequest.onlyIfOutside && "slot" in target) {
      const clip = current.clips.find((entry) => entry.slot === target.slot);
      const now = player.current?.getCurrentFrame();
      if (
        clip &&
        now !== undefined &&
        now >= clip.from &&
        now < clip.from + clip.durationInFrames
      ) {
        return;
      }
    }
    if (seekRequest.pause) {
      player.current?.pause();
    }
    player.current?.seekTo(
      Math.min(Math.max(0, Math.round(frame)), current.totalFrames - 1),
    );
  }, [seekRequest]);

  if (!draft || !timeline) {
    return null;
  }

  return (
    <section
      aria-label="Preview"
      className="flex min-h-0 flex-col gap-3"
      data-testid="preview"
    >
      <div
        ref={area}
        className="flex min-h-0 flex-1 items-center justify-center"
      >
        {inputProps && box.width > 0 && (
          <div
            className="overflow-hidden rounded-lg bg-black"
            style={{ width: box.width, height: box.height }}
          >
            <Player
              ref={player}
              component={SandwichVideo}
              inputProps={inputProps}
              durationInFrames={timeline.totalFrames}
              fps={draft.output.fps}
              compositionWidth={draft.output.width}
              compositionHeight={draft.output.height}
              style={{ width: box.width, height: box.height }}
              loop={loop}
              clickToPlay
              acknowledgeRemotionLicense
            />
          </div>
        )}
      </div>

      <PlayerControls
        player={player}
        attached={inputProps !== null && box.width > 0}
        totalFrames={timeline.totalFrames}
        fps={draft.output.fps}
        loop={loop}
        onLoopChange={setLoop}
      />

      <div className="flex items-stretch gap-3">
        <div className="flex-1">
          <LengthIndicator recipe={draft} />
        </div>
        <label className="flex items-center gap-1.5 self-center text-xs text-app-muted">
          <input
            type="checkbox"
            checked={showSafeZone}
            data-testid="safe-zone-toggle"
            onChange={(event) => setShowSafeZone(event.target.checked)}
          />
          Safe zone
        </label>
      </div>
    </section>
  );
};
