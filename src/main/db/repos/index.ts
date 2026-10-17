import type { Db } from "../connection";
import { createCaptionsRepo } from "./captions";
import { createMediaRepo } from "./media";
import { createProductsRepo } from "./products";
import { defaultRepoDeps, type RepoDeps } from "./shared";
import { createVideosRepo } from "./videos";

export function createRepos(db: Db, overrides: Partial<RepoDeps> = {}) {
  const deps = { ...defaultRepoDeps, ...overrides };
  return {
    products: createProductsRepo(db, deps),
    media: createMediaRepo(db, deps),
    captions: createCaptionsRepo(db, deps),
    videos: createVideosRepo(db, deps),
  };
}

export type Repos = ReturnType<typeof createRepos>;
