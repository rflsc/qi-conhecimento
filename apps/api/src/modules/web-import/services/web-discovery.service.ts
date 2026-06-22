import { Injectable } from '@nestjs/common';
import { WebDiscoveryStrategy } from '@qi-conhecimento/shared-types';
import { DiscoveredPage, DiscoveryContext } from '../discovery/discovery.interface';
import { ListingCrawlDiscovery } from '../discovery/listing-crawl.discovery';
import { SingleUrlDiscovery } from '../discovery/single-url.discovery';
import { SitemapDiscovery } from '../discovery/sitemap.discovery';
import { WebFetchService } from './web-fetch.service';

@Injectable()
export class WebDiscoveryService {
  constructor(
    private readonly singleUrlDiscovery: SingleUrlDiscovery,
    private readonly sitemapDiscovery: SitemapDiscovery,
    private readonly listingCrawlDiscovery: ListingCrawlDiscovery,
    private readonly webFetchService: WebFetchService,
  ) {}

  async discover(
    strategy: WebDiscoveryStrategy,
    options: {
      seedUrl: string;
      maxPages: number;
      maxDepth: number;
      sameOriginOnly: boolean;
      pathPrefix?: string;
      rateLimitMs?: number;
      onProgress?: DiscoveryContext['onProgress'];
    },
  ): Promise<DiscoveredPage[]> {
    const context: DiscoveryContext = {
      seedUrl: options.seedUrl,
      maxPages: options.maxPages,
      maxDepth: options.maxDepth,
      sameOriginOnly: options.sameOriginOnly,
      pathPrefix: options.pathPrefix,
      rateLimitMs: options.rateLimitMs,
      onProgress: options.onProgress,
      fetchHtml: (url) => this.webFetchService.fetchText(url),
    };

    switch (strategy) {
      case WebDiscoveryStrategy.SINGLE_URL:
        return this.singleUrlDiscovery.discover(context);
      case WebDiscoveryStrategy.SITEMAP:
        return this.sitemapDiscovery.discover(context);
      case WebDiscoveryStrategy.LISTING_CRAWL:
        return this.listingCrawlDiscovery.discover(context);
      case WebDiscoveryStrategy.FILESYSTEM:
        throw new Error('Descoberta filesystem ainda não implementada (Fase 3)');
      default:
        throw new Error(`Estratégia de descoberta não suportada: ${strategy}`);
    }
  }
}
