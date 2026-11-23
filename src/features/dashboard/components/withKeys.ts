/**
 * Table rows need a unique key, and names are not unique (two guides can share one), so the key is the
 * position in the list. These lists are snapshots, not edited in place.
 */
export const withKeys = <T extends object>(rows: T[]): (T & { key: number })[] => rows.map((r, key) => ({ ...r, key }));
