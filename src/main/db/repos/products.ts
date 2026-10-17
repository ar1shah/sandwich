import type { Product } from "../../../shared/library";
import type { Db } from "../connection";
import {
  NotFoundError,
  ProductHasVideosError,
  SlugTakenError,
} from "../errors";
import {
  checkedPath,
  escapeLike,
  isUniqueViolation,
  type RepoDeps,
} from "./shared";

type ProductRow = {
  id: string;
  full_name: string;
  short_name: string | null;
  slug: string;
  image_path: string | null;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    fullName: row.full_name,
    shortName: row.short_name,
    slug: row.slug,
    imagePath: row.image_path,
    lastUsedAt: row.last_used_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ProductInput = {
  fullName: string;
  shortName?: string | null;
  slug: string;
  imagePath?: string | null;
};

export type ProductPatch = Partial<ProductInput>;

export type ProductListOptions = {
  search?: string;
  // Archived products are hidden from pickers by default.
  includeArchived?: boolean;
};

export function createProductsRepo(db: Db, deps: RepoDeps) {
  const getRow = db.prepare("SELECT * FROM products WHERE id = ?");

  function get(id: string): Product | null {
    const row = getRow.get(id) as ProductRow | undefined;
    return row ? toProduct(row) : null;
  }

  function require(id: string): Product {
    const product = get(id);
    if (!product) {
      throw new NotFoundError("Product", id);
    }
    return product;
  }

  function create(input: ProductInput): Product {
    const id = deps.newId();
    const now = deps.now();
    try {
      db.prepare(
        `INSERT INTO products
           (id, full_name, short_name, slug, image_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.fullName,
        input.shortName ?? null,
        input.slug,
        checkedPath(input.imagePath, "product image path"),
        now,
        now,
      );
    } catch (error) {
      if (isUniqueViolation(error, "products.slug")) {
        throw new SlugTakenError(input.slug);
      }
      throw error;
    }
    return require(id);
  }

  function update(id: string, patch: ProductPatch): Product {
    const current = require(id);
    const next = {
      fullName: patch.fullName ?? current.fullName,
      shortName:
        patch.shortName === undefined ? current.shortName : patch.shortName,
      slug: patch.slug ?? current.slug,
      imagePath:
        patch.imagePath === undefined ? current.imagePath : patch.imagePath,
    };
    try {
      db.prepare(
        `UPDATE products
            SET full_name = ?, short_name = ?, slug = ?, image_path = ?, updated_at = ?
          WHERE id = ?`,
      ).run(
        next.fullName,
        next.shortName,
        next.slug,
        checkedPath(next.imagePath, "product image path"),
        deps.now(),
        id,
      );
    } catch (error) {
      if (isUniqueViolation(error, "products.slug")) {
        throw new SlugTakenError(next.slug);
      }
      throw error;
    }
    return require(id);
  }

  function list({ search, includeArchived = false }: ProductListOptions = {}) {
    const where: string[] = [];
    const params: string[] = [];
    if (!includeArchived) {
      where.push("archived_at IS NULL");
    }
    const term = search?.trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      where.push(
        "(full_name LIKE ? ESCAPE '\\' OR short_name LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')",
      );
      params.push(pattern, pattern, pattern);
    }
    const rows = db
      .prepare(
        `SELECT * FROM products
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY last_used_at IS NULL, last_used_at DESC, full_name COLLATE NOCASE`,
      )
      .all(...params) as ProductRow[];
    return rows.map(toProduct);
  }

  function setArchived(id: string, archivedAt: string | null): Product {
    require(id);
    db.prepare(
      "UPDATE products SET archived_at = ?, updated_at = ? WHERE id = ?",
    ).run(archivedAt, deps.now(), id);
    return require(id);
  }

  return {
    create,
    get,
    getBySlug(slug: string): Product | null {
      const row = db
        .prepare("SELECT * FROM products WHERE slug = ?")
        .get(slug) as ProductRow | undefined;
      return row ? toProduct(row) : null;
    },
    list,
    update,
    archive: (id: string) => setArchived(id, deps.now()),
    unarchive: (id: string) => setArchived(id, null),
    touchLastUsed(id: string): Product {
      require(id);
      db.prepare("UPDATE products SET last_used_at = ? WHERE id = ?").run(
        deps.now(),
        id,
      );
      return require(id);
    },
    // Hard delete. Cascades to the product's media and captions; refused when videos
    // exist (archive instead). Files on disk are the caller's job.
    remove(id: string): boolean {
      const videos = db
        .prepare("SELECT COUNT(*) AS n FROM videos WHERE product_id = ?")
        .get(id) as { n: number };
      if (videos.n > 0) {
        throw new ProductHasVideosError(id, videos.n);
      }
      return (
        db.prepare("DELETE FROM products WHERE id = ?").run(id).changes > 0
      );
    },
  };
}
