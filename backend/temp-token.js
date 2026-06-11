const { db } = require('./dist/db/client.js');
db.execute("SELECT id, github_access_token FROM users;")
  .then(r => console.log(r.rows))
  .catch(console.error)
  .finally(() => process.exit(0));
