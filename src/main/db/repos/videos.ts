import type { Video, VideoStatus } from "../../../shared/library";
import type { Db } from "../connection";
import { NotFoundError } from "../errors";
import { checkedPath, type RepoDeps } from "./shared";

type VideoRow = {
  id: string;
  product_id: string;
  status: VideoStatus;
  recipe_json: string;
  export_path: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
};

function toVideo(row: VideoRow): Video {
  return {
    id: row.id,
    productId: row.product_id,
    status: row.status,
    recipeJson: row.recipe_json,
    exportPath: row.export_path,
    batchId: row.batch_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type VideoInput = {
  productId: string;
  recipeJson: string;
  status?: VideoStatus; // default "draft"
  exportPath?: string | null;
  batchId?: string | null;
};

export type DraftUpsert = {
  // The recipe id: a draft is addressed by it from the first save.
  id: string;
  productId: string;
  recipeJson: string;
};

export type VideoPatch = {
  recipeJson?: string;
  status?: VideoStatus;
  exportPath?: string | null;
};

export type VideoListOptions = {
  productId?: string;
  status?: VideoStatus;
};

export function createVideosRepo(db: Db, deps: RepoDeps) {
  function get(id: string): Video | null {
    const row = db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as
      | VideoRow
      | undefined;
    return row ? toVideo(row) : null;
  }

  function require(id: string): Video {
    const video = get(id);
    if (!video) {
      throw new NotFoundError("Video", id);
    }
    return video;
  }

  return {
    create(input: VideoInput): Video {
      const id = deps.newId();
      const now = deps.now();
      db.prepare(
        `INSERT INTO videos
           (id, product_id, status, recipe_json, export_path, batch_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.productId,
        input.status ?? "draft",
        input.recipeJson,
        checkedPath(input.exportPath, "export path"),
        input.batchId ?? null,
        now,
        now,
      );
      return require(id);
    },
    get,
    // One statement: insert the draft, or update it when the id exists AND it is still a
    // draft. Keeps created_at and product_id on update. null = the id belongs to a video
    // that is not a draft, which is never overwritten.
    upsertDraft(input: DraftUpsert): Video | null {
      const now = deps.now();
      const changes = db
        .prepare(
          `INSERT INTO videos
             (id, product_id, status, recipe_json, created_at, updated_at)
           VALUES (?, ?, 'draft', ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             recipe_json = excluded.recipe_json,
             updated_at = excluded.updated_at
           WHERE videos.status = 'draft'`,
        )
        .run(input.id, input.productId, input.recipeJson, now, now).changes;
      return changes > 0 ? require(input.id) : null;
    },
    list({ productId, status }: VideoListOptions = {}): Video[] {
      const where: string[] = [];
      const params: string[] = [];
      if (productId) {
        where.push("product_id = ?");
        params.push(productId);
      }
      if (status) {
        where.push("status = ?");
        params.push(status);
      }
      const rows = db
        .prepare(
          `SELECT * FROM videos ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
           ORDER BY updated_at DESC, id`,
        )
        .all(...params) as VideoRow[];
      return rows.map(toVideo);
    },
    update(id: string, patch: VideoPatch): Video {
      const current = require(id);
      db.prepare(
        `UPDATE videos SET recipe_json = ?, status = ?, export_path = ?, updated_at = ? WHERE id = ?`,
      ).run(
        patch.recipeJson ?? current.recipeJson,
        patch.status ?? current.status,
        checkedPath(
          patch.exportPath === undefined
            ? current.exportPath
            : patch.exportPath,
          "export path",
        ),
        deps.now(),
        id,
      );
      return require(id);
    },
    remove(id: string): boolean {
      return db.prepare("DELETE FROM videos WHERE id = ?").run(id).changes > 0;
    },
  };
}
