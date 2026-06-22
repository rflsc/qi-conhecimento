import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { DiscoveredPage, DiscoveryContext, WebDiscoveryHandler } from './discovery.interface';
import { isSameOrigin, matchesPathPrefix, normalizeUrl, sleep, titleFromUrl } from '../utils/url.util';

const ARTICLE_URL_PATTERN = /\/articles\/\d+/i;

@Injectable()
export class ListingCrawlDiscovery implements WebDiscoveryHandler {
  async discover(context: DiscoveryContext): Promise<DiscoveredPage[]> {
    const seed = normalizeUrl(context.seedUrl);
    if (!seed) return [];

    const seedOrigin = new URL(seed).origin;
    const queue: Array<{ url: string; depth: number }> = [{ url: seed, depth: 0 }];
    const visited = new Set<string>();
    const discovered = new Map<string, DiscoveredPage>();

    while (queue.length > 0 && discovered.size < context.maxPages) {
      const current = queue.shift();
      if (!current || visited.has(current.url)) continue;
      visited.add(current.url);

      context.onProgress?.({
        discovered: discovered.size,
        visited: visited.size,
        currentUrl: current.url,
      });

      let html: string;
      try {
        if (context.rateLimitMs && visited.size > 1) {
          await sleep(context.rateLimitMs);
        }
        html = await context.fetchHtml(current.url);
      } catch {
        continue;
      }

      const pageTitle = cheerio.load(html)('title').first().text().trim() || titleFromUrl(current.url);
      if (this.isLikelyContentPage(current.url, html)) {
        discovered.set(current.url, { url: current.url, title: pageTitle });
      }

      if (current.depth >= context.maxDepth) continue;

      const links = this.extractLinks(html, current.url);
      for (const link of links) {
        if (discovered.size + queue.length >= context.maxPages * 3) break;
        if (visited.has(link.url)) continue;
        if (context.sameOriginOnly && !isSameOrigin(link.url, seedOrigin)) continue;
        if (!matchesPathPrefix(link.url, context.pathPrefix)) continue;

        if (this.tryAddArticleFromLink(discovered, link.url, context, link.title)) {
          context.onProgress?.({
            discovered: discovered.size,
            visited: visited.size,
            currentUrl: current.url,
          });
          if (discovered.size >= context.maxPages) break;
          continue;
        }

        queue.push({ url: link.url, depth: current.depth + 1 });
      }
    }

    return [...discovered.values()].slice(0, context.maxPages);
  }

  private extractLinks(html: string, baseUrl: string): Array<{ url: string; title?: string }> {
    const $ = cheerio.load(html);
    const links = new Map<string, string | undefined>();

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')?.trim();
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) {
        return;
      }
      const normalized = normalizeUrl(href, baseUrl);
      if (!normalized || links.has(normalized)) return;
      links.set(normalized, $(element).text().replace(/\s+/g, ' ').trim() || undefined);
    });

    return [...links.entries()].map(([url, title]) => ({ url, title }));
  }

  private tryAddArticleFromLink(
    discovered: Map<string, DiscoveredPage>,
    link: string,
    context: DiscoveryContext,
    title?: string,
  ): boolean {
    if (discovered.size >= context.maxPages || discovered.has(link) || !ARTICLE_URL_PATTERN.test(link)) {
      return false;
    }

    discovered.set(link, { url: link, title: title?.trim() || titleFromUrl(link) });
    return true;
  }

  private isLikelyContentPage(url: string, html: string): boolean {
    const $ = cheerio.load(html);
    if ($('article').length > 0) return true;
    if ($('main').length > 0 && $('main').text().trim().length > 400) return true;
    if (/articles\/\d+/i.test(url)) return true;
    if (/\.html?$/i.test(url)) return true;

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    return bodyText.length > 600;
  }
}
