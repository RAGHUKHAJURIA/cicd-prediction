import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const isProduction = process.env.NODE_ENV === "production";
const dbUrl = process.env["DATABASE_URL"];
const hasLocalDbUrl = dbUrl?.includes("localhost") || dbUrl?.includes("127.0.0.1");

const pool = new Pool({
  connectionString: dbUrl,
  ssl: process.env["DATABASE_SSL"] === "true" || (isProduction && !hasLocalDbUrl)
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool, { schema });
export { pool };