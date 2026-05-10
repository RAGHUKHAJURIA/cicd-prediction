import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env["DATABASE_URL"]) {
  throw new Error(
    "DATABASE_URL environment variable is not set. Check your .env file."
  );
}

/**
 * Shared pg connection pool.
 * Connection limits and timeouts are tuned for a production API server.
 */
const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err: Error) => {
  console.error("[db] Unexpected error on idle client:", err);
});

/**
 * Drizzle ORM database instance.
 * Import and use `db` throughout the application — do not create additional pools.
 */
export const db = drizzle(pool, { schema });

export { pool };
