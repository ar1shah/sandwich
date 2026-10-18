import { describe, expect, it } from "vitest";
import { exportBlocker } from "../src/shared/exportBlocker";
import {
  fileManagerName,
  showInFileManagerLabel,
} from "../src/shared/platform";
import { emptyRecipe, recipeWithBefore } from "./helpers/recipe";

function filled() {
  const recipe = recipeWithBefore();
  recipe.clips = recipe.clips.map((clip, index) => ({
    ...clip,
    mediaPath: `clips/2026-10/c${index}.mp4`,
    sourceDuration: 8,
  })) as typeof recipe.clips;
  return recipe;
}

describe("exportBlocker", () => {
  it("is null for a full draft with nothing pending or missing", () => {
    expect(
      exportBlocker({ draft: filled(), pendingSlots: [], missingSlots: [] }),
    ).toBeNull();
  });

  it("asks for a clip in every slot", () => {
    expect(
      exportBlocker({
        draft: emptyRecipe(),
        pendingSlots: [],
        missingSlots: [],
      }),
    ).toMatch(/every slot/i);
    expect(
      exportBlocker({
        draft: recipeWithBefore(),
        pendingSlots: [],
        missingSlots: [],
      }),
    ).toMatch(/every slot/i);
  });

  it("waits for imports and flags missing files first", () => {
    expect(
      exportBlocker({
        draft: filled(),
        pendingSlots: ["after"],
        missingSlots: ["before"],
      }),
    ).toMatch(/finish importing/i);
    expect(
      exportBlocker({
        draft: filled(),
        pendingSlots: [],
        missingSlots: ["before"],
      }),
    ).toMatch(/missing/i);
  });
});

describe("file manager wording", () => {
  it("names Finder on macOS and Explorer on Windows", () => {
    expect(fileManagerName("darwin")).toBe("Finder");
    expect(fileManagerName("win32")).toBe("Explorer");
    expect(fileManagerName("linux")).toBe("file manager");
    expect(showInFileManagerLabel("darwin")).toBe("Show in Finder");
    expect(showInFileManagerLabel("win32")).toBe("Show in Explorer");
  });
});
