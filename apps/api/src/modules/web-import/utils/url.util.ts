export function normalizeUrl(url: string, base?: string): string | null {
  try {
    const parsed = new URL(url, base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (!last) return parsed.hostname;
    return decodeURIComponent(last.replace(/[-_]/g, ' ')).replace(/\.(html?|php|aspx?)$/i, '');
  } catch {
    return url.slice(0, 120);
  }
}

export function matchesPathPrefix(url: string, pathPrefix?: string): boolean {
  if (!pathPrefix) return true;
  try {
    return new URL(url).pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
