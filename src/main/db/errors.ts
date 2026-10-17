export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found.`);
    this.name = "NotFoundError";
  }
}

export class SlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`The slug "${slug}" is already used by another product.`);
    this.name = "SlugTakenError";
  }
}

// Hard delete is only allowed for a product with no videos; archive it instead.
export class ProductHasVideosError extends Error {
  constructor(
    readonly productId: string,
    readonly videoCount: number,
  ) {
    super(
      `Product ${productId} has ${videoCount} video(s) and cannot be deleted. Archive it instead.`,
    );
    this.name = "ProductHasVideosError";
  }
}

export class SchemaTooNewError extends Error {
  constructor(
    readonly dbVersion: number,
    readonly appVersion: number,
  ) {
    super(
      `This library uses database version ${dbVersion}, but this app only understands up to ${appVersion}. Update Sandwich to open it.`,
    );
    this.name = "SchemaTooNewError";
  }
}

export class ForeignKeyViolationError extends Error {
  constructor(readonly violations: unknown[]) {
    super(
      `Foreign key check failed with ${violations.length} violation(s): ${JSON.stringify(violations.slice(0, 5))}`,
    );
    this.name = "ForeignKeyViolationError";
  }
}
