import { and, eq } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';
import type { DrizzleClient } from '../client';

/** A table that is scoped to a twin, optionally with a soft-delete status column. */
type TwinTable = SQLiteTable & {
  id: AnySQLiteColumn;
  twinId: AnySQLiteColumn;
  status?: AnySQLiteColumn;
  updatedAt?: AnySQLiteColumn;
};

/**
 * Small CRUD factory for an entity table. Covers list-all, by-id, create,
 * update, soft-delete. Everything is scoped to a twin for safety.
 *
 * SQLite uses text PKs; randomUUID() is generated server-side.
 * Tables without a `status` column can use every method except `remove`.
 */
export function makeRepo<const T extends { id: string }>(table: TwinTable) {
  return {
    list(tx: DrizzleClient, twinId: string): T[] {
      return tx.select().from(table).where(eq(table.twinId, twinId)).all() as T[];
    },
    byId(tx: DrizzleClient, twinId: string, id: string): T | undefined {
      return tx.select().from(table).where(and(eq(table.twinId, twinId), eq(table.id, id))).limit(1).get() as
        | T
        | undefined;
    },
    create(tx: DrizzleClient, twinId: string, data: Partial<Omit<T, 'id'>>): T {
      const id = randomUUID();
      tx.insert(table).values({ ...data, id, twinId } as Record<string, unknown>).run();
      return this.byId(tx, twinId, id) as T;
    },
    update(tx: DrizzleClient, twinId: string, id: string, data: Partial<T>): T | undefined {
      const patch: Record<string, unknown> = { ...data, updatedAt: new Date() };
      tx.update(table).set(patch).where(and(eq(table.twinId, twinId), eq(table.id, id))).run();
      return this.byId(tx, twinId, id);
    },
    /** Soft-delete: flips status rather than removing the row. */
    remove(tx: DrizzleClient, twinId: string, id: string): void {
      const status = table.status;
      if (!status) throw new Error('makeRepo.remove: table has no status column');
      tx.update(table).set({ status: 'archived' } as Record<string, unknown>).where(
        and(eq(table.twinId, twinId), eq(table.id, id)),
      ).run();
    },
  };
}
