import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/shared/rateLimit";

describe("createRateLimiter", () => {
  it("lets `max` events through per window, then refuses", () => {
    const t = 0;
    const limiter = createRateLimiter(3, 1000, () => t);
    expect([1, 2, 3, 4].map(() => limiter.take())).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("lets events through again once the window has passed", () => {
    let t = 0;
    const limiter = createRateLimiter(2, 1000, () => t);
    limiter.take();
    limiter.take();
    expect(limiter.take()).toBe(false);
    t = 999;
    expect(limiter.take()).toBe(false);
    t = 1000;
    expect(limiter.take()).toBe(true);
  });

  it("does not count refused events against the window", () => {
    let t = 0;
    const limiter = createRateLimiter(1, 1000, () => t);
    limiter.take();
    t = 500;
    limiter.take();
    t = 1000;
    expect(limiter.take()).toBe(true);
  });
});
