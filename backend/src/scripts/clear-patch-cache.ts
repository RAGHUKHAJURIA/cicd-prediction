import { queueRedis } from '../queue/redis.client';

async function clearPatchCaches() {
  try {
    // Make sure we are connected
    if (queueRedis.status !== 'ready' && queueRedis.status !== 'connect') {
      await queueRedis.connect();
    }
    const keys = await queueRedis.keys('scan-result:*');
    if (keys.length > 0) {
      await queueRedis.del(...keys);
      console.log(`Cleared ${keys.length} cached scan results`);
    } else {
      console.log('No cached scan results found.');
    }
  } catch (err) {
    console.error('Failed to clear patch caches:', err);
  } finally {
    try {
      await queueRedis.quit();
    } catch {}
    process.exit(0);
  }
}

clearPatchCaches();
