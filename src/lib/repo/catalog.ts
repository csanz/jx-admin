/**
 * THE COSMETICS CATALOG, read only: the portal's `catalog` collection (what the JBux shop sells: sku, name, kind,
 * gameId, priceCredits, enabled, cosmetic, assetRef, createdAt; the fields vary by kind). The asset registry
 * (jxasset, jx-docs/prds/jxasset.md) is not built yet, so this is the only asset data the console shows.
 * The page renders whatever fields the documents carry: the columns are the union of the shown rows' fields, the
 * known ones first. No framework imports.
 */
import type { Db, Document } from "mongodb";
import { PAGE_SIZE, pageLimit, paged, parsePage, type Paged } from "./paging.ts";
import { displayValue, idString } from "./values.ts";

/** The fields shown first, in this order; anything else a document carries follows, alphabetically. */
export const CATALOG_KNOWN_FIELDS = ["sku", "name", "kind", "gameId", "priceCredits", "enabled", "cosmetic", "assetRef", "createdAt"] as const;

export type CatalogRow = { id: string; fields: Record<string, string> };
export type CatalogList = Paged<CatalogRow> & { columns: string[] };

export function catalogRow(doc: Document): CatalogRow {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc)) if (k !== "_id") fields[k] = displayValue(v);
  return { id: idString(doc._id) ?? displayValue(doc._id), fields };
}

/** The columns the catalog table shows (owner 2026-11-17: fit the pane); every other field goes in the row's tooltip. */
export const CATALOG_TABLE_COLUMNS = [
  ["sku", "sku"],
  ["name", "name"],
  ["kind", "kind"],
  ["gameId", "game"],
  ["priceCredits", "price"],
  ["enabled", "enabled"],
  ["cosmetic", "cosmetic"],
  ["createdAt", "created"],
] as const;

/** Pure: the fields of a row that the table does not show, as "name: value" lines (for the tooltip). */
export function catalogExtraLines(row: CatalogRow): string[] {
  const shown = new Set<string>(CATALOG_TABLE_COLUMNS.map(([f]) => f));
  return Object.entries(row.fields).filter(([k]) => !shown.has(k)).map(([k, v]) => `${k}: ${v}`);
}

/** Pure: the columns for a set of rows, the known fields first (only those present), then the rest sorted. */
export function catalogColumns(rows: CatalogRow[]): string[] {
  const present = new Set(rows.flatMap((r) => Object.keys(r.fields)));
  const known = CATALOG_KNOWN_FIELDS.filter((f) => present.has(f));
  const rest = [...present].filter((f) => !(CATALOG_KNOWN_FIELDS as readonly string[]).includes(f)).sort();
  return [...known, ...rest];
}

/** The catalog by game, then kind, then sku; pages of PAGE_SIZE shown cumulatively (?page=n). */
export async function listCatalog(db: Db, input: { page?: unknown } = {}): Promise<CatalogList> {
  const page = parsePage(input.page);
  const col = db.collection("catalog");
  const [total, docs] = await Promise.all([
    col.countDocuments({}),
    col.find({}).sort({ gameId: 1, kind: 1, sku: 1, _id: 1 }).limit(pageLimit(page, PAGE_SIZE)).toArray(),
  ]);
  const rows = docs.map(catalogRow);
  return { ...paged(rows, total, page), columns: catalogColumns(rows) };
}
