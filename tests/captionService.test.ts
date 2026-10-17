import { describe, expect, it } from "vitest";
import { createCaptionService } from "../src/main/captions/captionService";
import { makeTempLibraryDb } from "./helpers/db";

async function setup() {
  const lib = await makeTempLibraryDb();
  const service = createCaptionService({
    getLibrary: () => ({ repos: lib.repos }),
  });
  const product = (slug: string) =>
    lib.repos.products.create({ fullName: slug, slug });
  return { ...lib, service, product };
}

describe("captionService", () => {
  it("creates generic and product captions and lists them", async () => {
    const { service, product } = await setup();
    const p = product("a");
    const generic = service.create({
      text: "hi",
      slot: "any",
      productId: null,
    });
    const specific = service.create({
      text: "yo",
      slot: "after",
      productId: p.id,
    });
    expect(generic.ok && specific.ok).toBe(true);
    expect(service.list().map((c) => c.text)).toEqual(["hi", "yo"]);
  });

  it("refuses a missing or archived product on create and bulk add", async () => {
    const { service, repos, product } = await setup();
    const p = product("a");
    repos.products.archive(p.id);
    for (const productId of ["nope", p.id]) {
      expect(
        service.create({ text: "x", slot: "any", productId }),
      ).toMatchObject({
        ok: false,
        code: "product-missing",
      });
      expect(
        service.bulkAdd({ productId, items: [{ slot: "any", text: "x" }] }),
      ).toMatchObject({ ok: false, code: "product-missing" });
    }
    expect(service.list()).toEqual([]);
  });

  it("bulk add stores every item for the batch product in order", async () => {
    const { service, product } = await setup();
    const p = product("a");
    const result = service.bulkAdd({
      productId: p.id,
      items: [
        { slot: "before", text: "one" },
        { slot: "any", text: "two" },
      ],
    });
    expect(result.ok && result.value.map((c) => [c.text, c.productId])).toEqual(
      [
        ["one", p.id],
        ["two", p.id],
      ],
    );
  });

  it("editing the text or slot of a caption on an archived product still works", async () => {
    const { service, repos, product } = await setup();
    const p = product("a");
    const made = service.create({ text: "old", slot: "any", productId: p.id });
    if (!made.ok) {
      throw new Error("setup failed");
    }
    repos.products.archive(p.id);
    const edited = service.update({
      id: made.value.id,
      patch: { text: "new", slot: "after" },
    });
    expect(edited).toMatchObject({
      ok: true,
      value: { text: "new", slot: "after", productId: p.id },
    });
    // Re-sending the same product (the form always does) is not a move.
    expect(
      service.update({ id: made.value.id, patch: { productId: p.id } }).ok,
    ).toBe(true);
  });

  it("moving a caption TO an archived or missing product fails; to generic works", async () => {
    const { service, repos, product } = await setup();
    const live = product("live");
    const old = product("old");
    repos.products.archive(old.id);
    const made = service.create({ text: "x", slot: "any", productId: live.id });
    if (!made.ok) {
      throw new Error("setup failed");
    }
    for (const productId of [old.id, "nope"]) {
      expect(
        service.update({ id: made.value.id, patch: { productId } }),
      ).toMatchObject({ ok: false, code: "product-missing" });
    }
    expect(repos.captions.get(made.value.id)?.productId).toBe(live.id);
    const toGeneric = service.update({
      id: made.value.id,
      patch: { productId: null },
    });
    expect(toGeneric).toMatchObject({ ok: true, value: { productId: null } });
  });

  it("reports not-found for edit and delete of a missing caption, and deletes real ones", async () => {
    const { service } = await setup();
    expect(service.update({ id: "nope", patch: { text: "x" } })).toMatchObject({
      ok: false,
      code: "not-found",
    });
    expect(service.remove("nope")).toMatchObject({
      ok: false,
      code: "not-found",
    });
    const made = service.create({ text: "x", slot: "any", productId: null });
    if (!made.ok) {
      throw new Error("setup failed");
    }
    expect(service.remove(made.value.id)).toEqual({ ok: true, value: true });
    expect(service.list()).toEqual([]);
  });

  it("throws when no library is open", () => {
    const service = createCaptionService({ getLibrary: () => null });
    expect(() => service.list()).toThrow(/library/i);
  });
});
