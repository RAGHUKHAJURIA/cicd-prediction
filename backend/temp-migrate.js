const { db } = require('./dist/db/client.js');
async function run() {
  try {
    const res = await db.execute("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'repos' AND constraint_type = 'UNIQUE';");
    console.log("Unique constraints:", res.rows);
    
    // Drop the old constraint
    for (const row of res.rows) {
      if (row.constraint_name.includes('repo_url')) {
        console.log("Dropping constraint", row.constraint_name);
        await db.execute(`ALTER TABLE repos DROP CONSTRAINT "${row.constraint_name}";`);
      }
    }
    
    // Add the new constraint
    console.log("Adding new constraint repo_url_user_id_unique");
    await db.execute(`ALTER TABLE repos ADD CONSTRAINT "repo_url_user_id_unique" UNIQUE ("repo_url", "user_id");`);
    console.log("Migration successful");
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
