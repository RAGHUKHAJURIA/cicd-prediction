import { db, pool } from "../db/client";
import {
  aiPredictions,
  aiRemediations,
  aiExplanations,
  analysisReports,
  findings,
  parsedArtifacts,
  scans,
  repos,
  workflows
} from "../db/schema";

async function cleanDatabase() {
  console.log("Starting database cleanup...");
  try {
    // 1. Delete from child tables first due to foreign keys
    const deletedPredictions = await db.delete(aiPredictions).returning();
    console.log(`Deleted ${deletedPredictions.length} AI predictions`);

    const deletedRemediations = await db.delete(aiRemediations).returning();
    console.log(`Deleted ${deletedRemediations.length} AI remediations`);

    const deletedExplanations = await db.delete(aiExplanations).returning();
    console.log(`Deleted ${deletedExplanations.length} AI explanations`);

    const deletedReports = await db.delete(analysisReports).returning();
    console.log(`Deleted ${deletedReports.length} analysis reports`);

    const deletedFindings = await db.delete(findings).returning();
    console.log(`Deleted ${deletedFindings.length} findings`);

    const deletedArtifacts = await db.delete(parsedArtifacts).returning();
    console.log(`Deleted ${deletedArtifacts.length} parsed artifacts`);

    const deletedScans = await db.delete(scans).returning();
    console.log(`Deleted ${deletedScans.length} scans`);

    const deletedRepos = await db.delete(repos).returning();
    console.log(`Deleted ${deletedRepos.length} repositories`);

    const deletedWorkflows = await db.delete(workflows).returning();
    console.log(`Deleted ${deletedWorkflows.length} legacy workflows`);

    console.log("Database cleanup completed successfully!");
  } catch (err) {
    console.error("Error cleaning database:", err);
  } finally {
    try {
      await pool.end();
    } catch {}
    process.exit(0);
  }
}

cleanDatabase();
