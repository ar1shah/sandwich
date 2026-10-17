import type { Caption, CaptionSlot } from "../../../shared/library";
import type { Db } from "../connection";
import { NotFoundError } from "../errors";
import type { RepoDeps } from "./shared";

type CaptionRow = {
  id: string;
  text: string;
  slot: CaptionSlot;
  product_id: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
};

function toCaption(row: CaptionRow): Caption {
  return {
    id: row.id,
    text: row.text,
    slot: row.slot,
    productId: row.product_id,
    useCount: row.use_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CaptionInput = {
  text: string;
  slot: CaptionSlot;
  productId?: string | null; // null or omitted = generic
};

export type CaptionPatch = Partial<CaptionInput>;

export type CaptionListOptions = {
  slot?: CaptionSlot;
  // Exact filter: a product id, or null for generic captions only. Omit for all.
  // The picker's "this product plus generic" rule lives in src/shared/captionFilter.ts.
  productId?: string | null;
};

export function createCaptionsRepo(db: Db, deps: RepoDeps) {
  function get(id: string): Caption | null {
    const row = db.prepare("SELECT * FROM captions WHERE id = ?").get(id) as
      | CaptionRow
      | undefined;
    return row ? toCaption(row) : null;
  }

  function require(id: string): Caption {
    const caption = get(id);
    if (!caption) {
      throw new NotFoundError("Caption", id);
    }
    return caption;
  }

  return {
    create(input: CaptionInput): Caption {
      const id = deps.newId();
      const now = deps.now();
      db.prepare(
        `INSERT INTO captions (id, text, slot, product_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, input.text, input.slot, input.productId ?? null, now, now);
      return require(id);
    },
    get,
    list({ slot, productId }: CaptionListOptions = {}): Caption[] {
      const where: string[] = [];
      const params: string[] = [];
      if (slot) {
        where.push("slot = ?");
        params.push(slot);
      }
      if (productId === null) {
        where.push("product_id IS NULL");
      } else if (productId !== undefined) {
        where.push("product_id = ?");
        params.push(productId);
      }
      const rows = db
        .prepare(
          `SELECT * FROM captions ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
           ORDER BY created_at, id`,
        )
        .all(...params) as CaptionRow[];
      return rows.map(toCaption);
    },
    update(id: string, patch: CaptionPatch): Caption {
      const current = require(id);
      db.prepare(
        `UPDATE captions SET text = ?, slot = ?, product_id = ?, updated_at = ? WHERE id = ?`,
      ).run(
        patch.text ?? current.text,
        patch.slot ?? current.slot,
        patch.productId === undefined ? current.productId : patch.productId,
        deps.now(),
        id,
      );
      return require(id);
    },
    incrementUseCount(id: string): Caption {
      require(id);
      db.prepare(
        "UPDATE captions SET use_count = use_count + 1 WHERE id = ?",
      ).run(id);
      return require(id);
    },
    remove(id: string): boolean {
      return (
        db.prepare("DELETE FROM captions WHERE id = ?").run(id).changes > 0
      );
    },
  };
}
