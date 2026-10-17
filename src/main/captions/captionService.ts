import {
  PRODUCT_MISSING_MESSAGE,
  type BulkAddCaptionsInput,
  type CaptionResult,
  type CreateCaptionInput,
  type UpdateCaptionInput,
} from "../../shared/captions";
import type { Caption } from "../../shared/library";
import type { Repos } from "../db/repos";

export type CaptionServiceDeps = {
  // The active library, read per call (null = none open).
  getLibrary: () => { repos: Repos } | null;
};

const productMissing = {
  ok: false,
  code: "product-missing",
  message: PRODUCT_MISSING_MESSAGE,
} as const;

const notFound = {
  ok: false,
  code: "not-found",
  message: "That caption no longer exists.",
} as const;

// The caption bank: list, create, edit, delete, bulk add. No Electron imports.
export function createCaptionService(deps: CaptionServiceDeps) {
  function requireRepos(): Repos {
    const library = deps.getLibrary();
    if (!library) {
      throw new Error("Open a library before using captions.");
    }
    return library.repos;
  }

  // A new caption may only point at a product that exists and is not archived.
  function usableProduct(repos: Repos, productId: string | null): boolean {
    if (productId === null) {
      return true;
    }
    const product = repos.products.get(productId);
    return product !== null && product.archivedAt === null;
  }

  return {
    list(): Caption[] {
      return requireRepos().captions.list();
    },

    create(input: CreateCaptionInput): CaptionResult<Caption> {
      const repos = requireRepos();
      if (!usableProduct(repos, input.productId)) {
        return productMissing;
      }
      return { ok: true, value: repos.captions.create(input) };
    },

    // Only a change of product to a non-null one is checked: fixing the text of a caption
    // whose product has since been archived must keep working.
    update({ id, patch }: UpdateCaptionInput): CaptionResult<Caption> {
      const repos = requireRepos();
      const current = repos.captions.get(id);
      if (!current) {
        return notFound;
      }
      if (
        patch.productId !== undefined &&
        patch.productId !== null &&
        patch.productId !== current.productId &&
        !usableProduct(repos, patch.productId)
      ) {
        return productMissing;
      }
      return { ok: true, value: repos.captions.update(id, patch) };
    },

    remove(id: string): CaptionResult<true> {
      return requireRepos().captions.remove(id)
        ? { ok: true, value: true }
        : notFound;
    },

    bulkAdd(input: BulkAddCaptionsInput): CaptionResult<Caption[]> {
      const repos = requireRepos();
      if (!usableProduct(repos, input.productId)) {
        return productMissing;
      }
      return {
        ok: true,
        value: repos.captions.createMany(
          input.items.map((item) => ({ ...item, productId: input.productId })),
        ),
      };
    },
  };
}

export type CaptionService = ReturnType<typeof createCaptionService>;
