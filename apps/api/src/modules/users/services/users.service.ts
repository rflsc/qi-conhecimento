import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@qi-conhecimento/shared-types';
import { DomainEvents } from '@events/domain-events';
import { CreateUserDto, UpdateUserDto } from '../dtos/user.dto';
import { UsersRepository } from '../repositories/users.repository';
import { UserDocument } from '../schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly bcryptRounds: number;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService,
  ) {
    this.bcryptRounds = Number(configService.get('BCRYPT_ROUNDS') ?? 12);
  }

  async create(dto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    const user = await this.usersRepository.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      passwordHash,
      role: dto.role ?? UserRole.USER,
      deletedAt: null,
    });

    this.eventEmitter.emit(DomainEvents.USER_CREATED, { userId: user._id.toString() });
    return user;
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(page: number, limit: number) {
    const [data, total] = await this.usersRepository.findAll(page, limit);
    return { data, total, page, limit };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const payload: Record<string, unknown> = { ...dto };
    if (dto.password) {
      payload['passwordHash'] = await bcrypt.hash(dto.password, this.bcryptRounds);
      delete payload['password'];
    }

    const user = await this.usersRepository.updateById(id, payload);
    if (!user) throw new NotFoundException('User not found');

    this.eventEmitter.emit(DomainEvents.USER_UPDATED, { userId: id });
    return user;
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.usersRepository.softDelete(id);
    if (!user) throw new NotFoundException('User not found');
  }
}
