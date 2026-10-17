import { describe, expect, it } from "vitest";
import {
  buildMigrationList,
  parseMigrationFileName,
} from "../src/shared/migrations";

describe("parseMigrationFileName", () => {
  it("parses NNN_name.sql", () => {
    expect(parseMigrationFileName("001_init.sql")).toEqual({
      version: 1,
      name: "init",
    });
    expect(parseMigrationFileName("012_add_creators.sql")?.version).toBe(12);
  });

  it.each([
    "init.sql",
    "1_init.sql",
    "000_zero.sql",
    "001_Init.sql",
    "001_init.txt",
  ])("rejects %s", (name) => {
    expect(parseMigrationFileName(name)).toBeNull();
  });
});

describe("buildMigrationList", () => {
  const file = (fileName: string, sql = "select 1;") => ({ fileName, sql });

  it("orders by version regardless of input order", () => {
    const list = buildMigrationList([file("002_b.sql"), file("001_a.sql")]);
    expect(list.map((m) => m.version)).toEqual([1, 2]);
  });

  it("rejects duplicates, gaps and bad names", () => {
    expect(() =>
      buildMigrationList([file("001_a.sql"), file("001_b.sql")]),
    ).toThrow(/Duplicate/);
    expect(() =>
      buildMigrationList([file("001_a.sql"), file("003_c.sql")]),
    ).toThrow(/contiguous/);
    expect(() => buildMigrationList([file("002_a.sql")])).toThrow(/contiguous/);
    expect(() => buildMigrationList([file("bad.sql")])).toThrow(/NNN_name/);
  });

  it("reads the foreign_keys=off directive from the leading comments only", () => {
    const off = buildMigrationList([
      file(
        "001_a.sql",
        "-- rebuild table\n-- sandwich: foreign_keys=off\nCREATE TABLE t(x);",
      ),
    ]);
    expect(off[0].foreignKeys).toBe("off");

    const ignored = buildMigrationList([
      file("001_a.sql", "CREATE TABLE t(x);\n-- sandwich: foreign_keys=off"),
    ]);
    expect(ignored[0].foreignKeys).toBe("on");
  });
});
