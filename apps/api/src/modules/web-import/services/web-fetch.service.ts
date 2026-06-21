import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { WebImportSettingsService } from './web-import-settings.service';

@Injectable()
export class WebFetchService {
  constructor(
    private readonly settingsService: WebImportSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WebFetchService.name);
  }

  async fetchText(url: string): Promise<string> {
    const settings = await this.settingsService.getSettings();

    const response = await fetch(url, {
      headers: {
        'User-Agent': settings.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(settings.fetchTimeoutMs),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Falha ao buscar URL: HTTP ${response.status} — ${url}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xml') &&
      !contentType.includes('text/xml')
    ) {
      this.logger.warn({ url, contentType }, 'Content-Type inesperado — tentando parsear mesmo assim');
    }

    return response.text();
  }
}
