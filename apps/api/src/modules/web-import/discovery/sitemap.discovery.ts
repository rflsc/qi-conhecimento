import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { DiscoveredPage, DiscoveryContext, WebDiscoveryHandler } from './discovery.interface';
import { matchesPathPrefix, normalizeUrl } from '../utils/url.util';

@Injectable()
export class SitemapDiscovery implements WebDiscoveryHandler {
  async discover(context: DiscoveryContext): Promise<DiscoveredPage[]> {
    const candidates = this.buildSitemapCandidates(context.seedUrl);
    const discovered = new Map<string, DiscoveredPage>();

    for (const sitemapUrl of candidates) {
      if (discovered.size >= context.maxPages) break;

      let xml: string;
      try {
        xml = await context.fetchHtml(sitemapUrl);
      } catch {
        continue;
      }

      const urls = this.extractLocUrls(xml);
      const nestedSitemaps = urls.filter((url) => url.endsWith('.xml') || url.includes('sitemap'));

      for (const nested of nestedSitemaps) {
        if (discovered.size >= context.maxPages) break;
        try {
          const nestedXml = await context.fetchHtml(nested);
          this.addUrls(discovered, this.extractLocUrls(nestedXml), context, context.maxPages);
        } catch {
          // ignora sitemap filho inacessível
        }
      }

      this.addUrls(discovered, urls, context, context.maxPages);
      if (discovered.size > 0) break;
    }

    return [...discovered.values()].slice(0, context.maxPages);
  }

  private buildSitemapCandidates(seedUrl: string): string[] {
    const normalized = normalizeUrl(seedUrl);
    if (!normalized) return [];

    const parsed = new URL(normalized);
    const candidates = new Set<string>();

    if (normalized.endsWith('.xml') || parsed.pathname.includes('sitemap')) {
      candidates.add(normalized);
    }

    candidates.add(`${parsed.origin}/sitemap.xml`);
    candidates.add(`${parsed.origin}/sitemap_index.xml`);
    candidates.add(`${normalized.replace(/\/$/, '')}/sitemap.xml`);

    return [...candidates];
  }

  private extractLocUrls(xml: string): string[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const urls: string[] = [];
    $('loc').each((_, element) => {
      const loc = $(element).text().trim();
      if (loc) urls.push(loc);
    });
    return urls;
  }

  private addUrls(
    discovered: Map<string, DiscoveredPage>,
    urls: string[],
    context: DiscoveryContext,
    maxPages: number,
  ): void {
    const seedOrigin = new URL(context.seedUrl).origin;

    for (const raw of urls) {
      if (discovered.size >= maxPages) break;
      if (raw.endsWith('.xml') || raw.includes('sitemap')) continue;

      const url = normalizeUrl(raw);
      if (!url) continue;
      if (context.sameOriginOnly && new URL(url).origin !== seedOrigin) continue;
      if (!matchesPathPrefix(url, context.pathPrefix)) continue;
      if (discovered.has(url)) continue;

      discovered.set(url, { url });
    }
  }
}
