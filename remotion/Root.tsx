import { Composition } from "remotion";
import {
  DEFAULT_SPIKE_PROPS,
  SPIKE_COMPOSITION_ID,
  SPIKE_DURATION_IN_FRAMES,
  SPIKE_FPS,
  SPIKE_HEIGHT,
  SPIKE_WIDTH,
} from "../src/shared/spikeProps";
import { Spike } from "./Spike";

// Step 0.4 spike only. The real "Sandwich" composition replaces this in step 1.4.
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={SPIKE_COMPOSITION_ID}
      component={Spike}
      durationInFrames={SPIKE_DURATION_IN_FRAMES}
      fps={SPIKE_FPS}
      width={SPIKE_WIDTH}
      height={SPIKE_HEIGHT}
      defaultProps={DEFAULT_SPIKE_PROPS}
    />
  );
};
