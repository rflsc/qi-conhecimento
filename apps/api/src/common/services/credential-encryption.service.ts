import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CredentialEncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const keyB64 = this.configService.get<string>('API_CREDENTIALS_ENCRYPTION_KEY', '');
    this.key = keyB64 ? Buffer.from(keyB64, 'base64') : crypto.randomBytes(32);
  }

  encrypt(plainCredentials: Record<string, string | undefined>): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const json = JSON.stringify(plainCredentials);
    let encrypted = cipher.update(json, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(encryptedStr: string): Record<string, string> {
    if (!encryptedStr) return {};
    try {
      const [ivHex, authTagHex, encryptedHex] = encryptedStr.split(':');
      if (!ivHex || !authTagHex || !encryptedHex) return {};
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted) as Record<string, string>;
    } catch {
      return {};
    }
  }

  mask(value: string | undefined): string {
    if (!value) return '';
    if (value.length <= 8) return '****';
    return value.slice(0, 4) + '...' + value.slice(-4);
  }
}
