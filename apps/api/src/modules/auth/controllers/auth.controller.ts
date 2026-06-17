import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PublicAccess } from '@common/decorators/access.decorators';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { LocalAuthGuard } from '@common/guards/local-auth.guard';
import { UserDocument } from '@modules/users/schemas/user.schema';
import {
  AuthTokensDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from '../dtos/auth.dto';
import { AuthService } from '../services/auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @PublicAccess()
  @Post('register')
  @ApiOperation({ summary: 'Cria conta e retorna tokens' })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @PublicAccess()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: 'Login com email/senha' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  login(@Body() _dto: LoginDto, @CurrentUser() user: UserDocument) {
    return this.authService.login(user);
  }

  @PublicAccess()
  @Post('refresh')
  @ApiOperation({ summary: 'Renova access token via refresh token' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoga refresh token' })
  @ApiResponse({ status: 204 })
  async logout(@CurrentUser() user: UserDocument) {
    await this.authService.logout(user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retorna usuário autenticado' })
  me(@CurrentUser() user: UserDocument) {
    return user;
  }
}
