import { describe, expect, it } from "vitest";
import { APP_VERSION_CHANNEL } from "../src/shared/ipc";

describe("test runner", () => {
  it("runs and can import from src/shared", () => {
    expect(APP_VERSION_CHANNEL).toBe("app:version");
  });
});
