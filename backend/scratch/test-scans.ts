import { db } from "../src/db/client";
import { scans, repos } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function test() {
  try {
    const repoId = "5d4be1b2-3a5a-46dd-a5c8-3e58e249ac1f";
    const repo = await db.select().from(repos).where(eq(repos.id, repoId)).limit(1);
    console.log("Repo info:", repo);

    const scanList = await db
      .select()
      .from(scans)
      .where(eq(scans.repoId, repoId))
      .orderBy(scans.triggeredAt);
    
    console.log("Scans list for repo:", scanList.map(s => ({
      id: s.id,
      status: s.status,
      triggeredAt: s.triggeredAt,
      completedAt: s.completedAt,
      errorMessage: s.errorMessage
    })));
  } catch (error) {
    console.error("Failed to query scans:", error);
  } finally {
    process.exit(0);
  }
}

test();
