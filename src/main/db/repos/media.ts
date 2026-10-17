import type { Media, MediaKind } from "../../../shared/library";
import type { Db } from "../connection";
import { NotFoundError } from "../errors";
import { checkedPath, type RepoDeps } from "./shared";

type MediaRow = {
  id: string;
  kind: MediaKind;
  product_id: string | null;
  path: string;
  thumb_path: string | null;
  filmstrip_path: string | null;
  original_name: string | null;
  duration: number;
  width: number;
  height: number;
  recorded_at: string | null;
  was_hdr: number;
  created_at: string;
};

function toMedia(row: MediaRow): Media {
  return {
    id: row.id,
    kind: row.kind,
    productId: row.product_id,
    path: row.path,
    thumbPath: row.thumb_path,
    filmstripPath: row.filmstrip_path,
    originalName: row.original_name,
    duration: row.duration,
    width: row.width,
    height: row.height,
    recordedAt: row.recorded_at,
    wasHdr: row.was_hdr === 1,
    createdAt: row.created_at,
  };
}

export type MediaInput = {
  // Defaults to a new id. Pass one when file names are built from it before the insert.
  id?: string;
  kind: MediaKind;
  productId?: string | null;
  path: string;
  thumbPath?: string | null;
  filmstripPath?: string | null;
  originalName?: string | null;
  duration: number;
  width: number;
  height: number;
  recordedAt?: string | null;
  wasHdr?: boolean;
};

export type MediaListOptions = {
  kind?: MediaKind;
  productId?: string;
};

export function createMediaRepo(db: Db, deps: RepoDeps) {
  function get(id: string): Media | null {
    const row = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as
      | MediaRow
      | undefined;
    return row ? toMedia(row) : null;
  }

  return {
    create(input: MediaInput): Media {
      const id = input.id ?? deps.newId();
      db.prepare(
        `INSERT INTO media
           (id, kind, product_id, path, thumb_path, filmstrip_path, original_name,
            duration, width, height, recorded_at, was_hdr, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.kind,
        input.productId ?? null,
        checkedPath(input.path, "media path"),
        checkedPath(input.thumbPath, "thumbnail path"),
        checkedPath(input.filmstripPath, "filmstrip path"),
        input.originalName ?? null,
        input.duration,
        input.width,
        input.height,
        input.recordedAt ?? null,
        input.wasHdr ? 1 : 0,
        deps.now(),
      );
      const created = get(id);
      if (!created) {
        throw new NotFoundError("Media", id);
      }
      return created;
    },
    get,
    list({ kind, productId }: MediaListOptions = {}): Media[] {
      const where: string[] = [];
      const params: string[] = [];
      if (kind) {
        where.push("kind = ?");
        params.push(kind);
      }
      if (productId) {
        where.push("product_id = ?");
        params.push(productId);
      }
      const rows = db
        .prepare(
          `SELECT * FROM media ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
           ORDER BY created_at DESC, id`,
        )
        .all(...params) as MediaRow[];
      return rows.map(toMedia);
    },
    remove(id: string): boolean {
      return db.prepare("DELETE FROM media WHERE id = ?").run(id).changes > 0;
    },
  };
}
