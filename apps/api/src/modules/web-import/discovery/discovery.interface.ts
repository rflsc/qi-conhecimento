export interface DiscoveredPage {
  url: string;
  title?: string;
}

export interface DiscoveryContext {
  seedUrl: string;
  maxPages: number;
  maxDepth: number;
  sameOriginOnly: boolean;
  pathPrefix?: string;
  fetchHtml: (url: string) => Promise<string>;
}

export interface WebDiscoveryHandler {
  discover(context: DiscoveryContext): Promise<DiscoveredPage[]>;
}
