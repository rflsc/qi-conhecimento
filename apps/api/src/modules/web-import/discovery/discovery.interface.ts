export interface DiscoveredPage {
  url: string;
  title?: string;
}

export interface DiscoveryProgress {
  discovered: number;
  visited: number;
  currentUrl?: string;
}

export interface DiscoveryContext {
  seedUrl: string;
  maxPages: number;
  maxDepth: number;
  sameOriginOnly: boolean;
  pathPrefix?: string;
  rateLimitMs?: number;
  fetchHtml: (url: string) => Promise<string>;
  onProgress?: (progress: DiscoveryProgress) => void;
}

export interface WebDiscoveryHandler {
  discover(context: DiscoveryContext): Promise<DiscoveredPage[]>;
}
