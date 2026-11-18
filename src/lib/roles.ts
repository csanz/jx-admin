/** The role as the console shows it: the portal stores "player" for an ordinary account; the console says "user". */
export const roleLabel = (role: string) => (role === "player" ? "user" : role);
