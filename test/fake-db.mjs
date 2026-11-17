/**
 * A small in-memory stand-in for the mongodb Db the repo modules take: collection(name) with find (filter, sort,
 * skip, limit, toArray; the projection is IGNORED on purpose, so a test proves a repo never relies on it to hide a
 * field), findOne, countDocuments. Filters: equality (ObjectId-aware), $or, $in, $ne, $regex + $options "i".
 * Every query is recorded in `db.queries` for assertions.
 */
import { ObjectId } from "mongodb";

const eq = (a, b) => (a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) && (a instanceof ObjectId) === (b instanceof ObjectId) : a === b);

function matchValue(v, cond) {
  if (cond && typeof cond === "object" && !(cond instanceof ObjectId) && !(cond instanceof Date) && !Array.isArray(cond)) {
    const keys = Object.keys(cond);
    if (keys.some((k) => k.startsWith("$"))) {
      for (const [op, arg] of Object.entries(cond)) {
        if (op === "$regex") {
          if (typeof v !== "string" || !new RegExp(arg, cond.$options ?? "").test(v)) return false;
        } else if (op === "$options") continue;
        else if (op === "$in") {
          if (!arg.some((a) => eq(v, a))) return false;
        } else if (op === "$ne") {
          if (eq(v, arg)) return false;
        } else throw new Error(`fake-db: unsupported operator ${op}`);
      }
      return true;
    }
  }
  return eq(v, cond);
}

export function matches(doc, filter = {}) {
  for (const [k, cond] of Object.entries(filter)) {
    if (k === "$or") {
      if (!cond.some((f) => matches(doc, f))) return false;
      continue;
    }
    if (!matchValue(doc[k], cond)) return false;
  }
  return true;
}

function compare(a, b, spec) {
  for (const [k, dir] of Object.entries(spec)) {
    let x = a[k];
    let y = b[k];
    if (x instanceof ObjectId) x = x.toHexString();
    if (y instanceof ObjectId) y = y.toHexString();
    if (x instanceof Date) x = x.getTime();
    if (y instanceof Date) y = y.getTime();
    if (x === y) continue;
    if (x === undefined || x === null) return -dir;
    if (y === undefined || y === null) return dir;
    return (x < y ? -1 : 1) * dir;
  }
  return 0;
}

export function fakeDb(collections = {}) {
  const queries = [];
  const db = {
    queries,
    collection(name) {
      const docs = () => collections[name] ?? [];
      return {
        find(filter = {}, options = {}) {
          queries.push({ collection: name, op: "find", filter, options });
          let sortSpec = null;
          let skip = 0;
          let limit = 0;
          const cursor = {
            sort(s) { sortSpec = s; return cursor; },
            skip(n) { skip = n; return cursor; },
            limit(n) { limit = n; return cursor; },
            async toArray() {
              let out = docs().filter((d) => matches(d, filter));
              if (sortSpec) out = [...out].sort((a, b) => compare(a, b, sortSpec));
              out = out.slice(skip, limit ? skip + limit : undefined);
              return out.map((d) => ({ ...d }));
            },
          };
          return cursor;
        },
        async findOne(filter = {}, options = {}) {
          queries.push({ collection: name, op: "findOne", filter, options });
          const d = docs().find((x) => matches(x, filter));
          return d ? { ...d } : null;
        },
        async countDocuments(filter = {}) {
          queries.push({ collection: name, op: "count", filter });
          return docs().filter((d) => matches(d, filter)).length;
        },
      };
    },
  };
  return db;
}
