/**
 * THE USERS LIST'S ORDER (owner 2026-11-19: "a sorting mechanism for latest user sign in"), shared by the browser
 * (the column headers in UsersConsole) and the server (the repo's pipeline), so it imports nothing: no database, no
 * framework, no env.
 */

/** The columns the list sorts by: created (the default, newest first), last active (latest first), name (A to Z). */
export const USER_SORTS = ["created", "active", "name"] as const;
export type UserSort = (typeof USER_SORTS)[number];
export type SortDir = "asc" | "desc";
export type UserOrder = { sort: UserSort; dir: SortDir };
export const DEFAULT_USER_ORDER: UserOrder = { sort: "created", dir: "desc" };

/** The direction a column starts with when it is picked: dates latest first, names A to Z. */
export function defaultDir(sort: UserSort): SortDir {
  return sort === "name" ? "asc" : "desc";
}

/** ?sort=&dir= -> an order; anything unknown is the default column or that column's starting direction. */
export function parseUserOrder(sort: unknown, dir: unknown): UserOrder {
  const s = USER_SORTS.includes(sort as UserSort) ? (sort as UserSort) : DEFAULT_USER_ORDER.sort;
  return { sort: s, dir: dir === "asc" || dir === "desc" ? dir : defaultDir(s) };
}
