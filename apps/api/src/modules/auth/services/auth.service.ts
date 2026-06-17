import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { JwtPayload } from '@qi-conhecimento/shared-types';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { UsersService } from '@modules/users/services/users.service';
import { UserDocument } from '@modules/users/schemas/user.schema';
import { RegisterDto } from '../dtos/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto);
    return this.issueTokenPair(user);
  }

  async login(user: UserDocument) {
    return this.issueTokenPair(user);
  }

  async refresh(refreshToken: string) {
    const users = await this.findUserByRefreshToken(refreshToken);
    if (!users) throw new UnauthorizedException('Invalid refresh token');

    await this.usersRepository.updateRefreshTokenHash(users._id.toString(), null);
    return this.issueTokenPair(users);
  }

  async logout(userId: string) {
    await this.usersRepository.updateRefreshTokenHash(userId, null);
  }

  private async issueTokenPair(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = uuidv4();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.usersRepository.updateRefreshTokenHash(user._id.toString(), refreshTokenHash);

    return { accessToken, refreshToken };
  }

  private async findUserByRefreshToken(refreshToken: string): Promise<UserDocument | null> {
    // MVP: busca linear — evoluir para índice dedicado em produção
    const candidates = await this.usersRepository.findAll(1, 1000);
    for (const user of candidates[0]) {
      const withHash = await this.usersRepository.findByEmail(user.email);
      if (!withHash?.refreshTokenHash) continue;
      const match = await bcrypt.compare(refreshToken, withHash.refreshTokenHash);
      if (match) return withHash;
    }
    return null;
  }
}
