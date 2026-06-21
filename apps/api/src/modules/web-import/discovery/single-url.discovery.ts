import { Injectable } from '@nestjs/common';
import { DiscoveredPage, DiscoveryContext, WebDiscoveryHandler } from './discovery.interface';
import { normalizeUrl, titleFromUrl } from '../utils/url.util';

@Injectable()
export class SingleUrlDiscovery implements WebDiscoveryHandler {
  async discover(context: DiscoveryContext): Promise<DiscoveredPage[]> {
    const url = normalizeUrl(context.seedUrl);
    if (!url) return [];
    return [{ url, title: titleFromUrl(url) }];
  }
}
