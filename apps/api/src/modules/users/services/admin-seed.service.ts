import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { UserRole } from '@qi-conhecimento/shared-types';
import { UsersRepository } from '../repositories/users.repository';
import { UsersService } from './users.service';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminSeedService.name);
  }

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<string>('SEED_ADMIN_ENABLED') === 'true';
    if (!enabled) return;

    const email = this.configService.get<string>('SEED_ADMIN_EMAIL');
    const password = this.configService.get<string>('SEED_ADMIN_PASSWORD');
    const name = this.configService.get<string>('SEED_ADMIN_NAME') ?? 'Admin Qi';

    if (!email || !password) {
      this.logger.warn('SEED_ADMIN_ENABLED=true but email/password missing — skipping admin seed');
      return;
    }

    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      this.logger.info({ email }, 'Admin seed skipped — user already exists');
      return;
    }

    await this.usersService.create({
      name,
      email,
      password,
      role: UserRole.ADMIN,
    });

    this.logger.info({ email }, 'Default admin user created from seed');
  }
}
