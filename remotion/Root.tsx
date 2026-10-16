import { Composition, type CalculateMetadataFunction } from "remotion";
import { createEmptyRecipe, RecipeSchema } from "../src/shared/recipe";
import { buildTimeline } from "../src/shared/timeline";
import { SandwichVideo } from "./SandwichVideo";
import type { SandwichProps } from "./types";

export const SANDWICH_COMPOSITION_ID = "Sandwich";

// Fixed id and date so the prebuilt bundle is deterministic. Empty slots render black; real
// props always come from the caller (Player, Studio --props, renderMedia).
const DEFAULT_PROPS: SandwichProps = {
  recipe: createEmptyRecipe(
    { id: "default", slug: "default" },
    { clipDurations: { before: 3, after: 4, broll: 5 } },
    { id: "00000000-0000-4000-8000-000000000000", now: new Date(0) },
  ),
  mediaBaseUrl: "http://127.0.0.1:0/m/default",
};

// Validates the recipe once, here, and hands the parsed copy to the component.
const calculateMetadata: CalculateMetadataFunction<SandwichProps> = ({
  props,
}) => {
  const recipe = RecipeSchema.parse(props.recipe);
  const { totalFrames } = buildTimeline(recipe, recipe.output.fps);
  return {
    durationInFrames: totalFrames,
    fps: recipe.output.fps,
    width: recipe.output.width,
    height: recipe.output.height,
    props: { ...props, recipe },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={SANDWICH_COMPOSITION_ID}
      component={SandwichVideo}
      durationInFrames={buildTimeline(DEFAULT_PROPS.recipe, 30).totalFrames}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={calculateMetadata}
    />
  );
};
