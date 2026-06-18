import type { ConnectionOptions } from 'bullmq';

function normalizeUpstashUrl(redisUrl: string): URL {
  const trimmed = redisUrl.trim();

  // Upstash exige TLS — redis:// sem TLS causa ECONNRESET
  const withTls =
    trimmed.includes('upstash.io') && trimmed.startsWith('redis://')
      ? trimmed.replace(/^redis:\/\//, 'rediss://')
      : trimmed;

  return new URL(withTls);
}

export function createBullRedisConnection(redisUrl: string): ConnectionOptions {
  const parsed = normalizeUpstashUrl(redisUrl);
  const isTls = parsed.protocol === 'rediss:';

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: decodeURIComponent(parsed.username || 'default'),
    password: decodeURIComponent(parsed.password),
    ...(isTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0,
    connectTimeout: 10_000,
    retryStrategy: (times: number) => Math.min(times * 200, 3_000),
  };
}
