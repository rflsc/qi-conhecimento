import type { ConnectionOptions } from 'bullmq';

export function createBullRedisConnection(redisUrl: string): ConnectionOptions {
  const isTls = redisUrl.startsWith('rediss://');

  return {
    url: redisUrl,
    ...(isTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
