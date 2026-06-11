const { db } = require('./dist/db/client.js');
db.execute("UPDATE repos SET user_id = 'ef523284-21db-418a-a8cb-dc910b9b8efe' WHERE user_id IS NULL;")
  .then(r => console.log('Updated rows:', r.rowCount))
  .catch(console.error)
  .finally(() => process.exit(0));
