import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class StorageService implements OnModuleInit {
  private storagePath!: string;
  private maxUploadBytes!: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageService.name);
  }

  async onModuleInit(): Promise<void> {
    this.storagePath = this.configService.get<string>('STORAGE_PATH') ?? './storage';
    const maxMb = Number(this.configService.get<string>('MAX_UPLOAD_SIZE_MB') ?? 50);
    this.maxUploadBytes = maxMb * 1024 * 1024;
    await mkdir(this.storagePath, { recursive: true });
    this.logger.info({ path: this.storagePath, maxMb }, 'Storage inicializado');
  }

  get maxSizeBytes(): number {
    return this.maxUploadBytes;
  }

  async saveFile(documentId: string, file: Express.Multer.File): Promise<string> {
    if (file.size > this.maxUploadBytes) {
      throw new Error(`Arquivo excede o limite de ${this.maxUploadBytes / 1024 / 1024} MB`);
    }

    const ext = extname(file.originalname) || '.bin';
    const relativePath = join(documentId, `source${ext}`);
    const absolutePath = join(this.storagePath, relativePath);
    await mkdir(join(this.storagePath, documentId), { recursive: true });
    await writeFile(absolutePath, file.buffer);
    return relativePath.replace(/\\/g, '/');
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const absolutePath = join(this.storagePath, relativePath);
    return readFile(absolutePath);
  }

  async fetchUrl(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'QiConhecimento/1.0 (+https://altoqi.com)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Falha ao buscar URL: HTTP ${response.status}`);
    return response.text();
  }
}
