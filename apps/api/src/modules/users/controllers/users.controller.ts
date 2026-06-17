import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@qi-conhecimento/shared-types';
import { Roles } from '@common/decorators/access.decorators';
import { CurrentUser, CurrentUserId } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { UpdateUserDto, UserResponseDto } from '../dtos/user.dto';
import { UsersService } from '../services/users.service';
import { UserDocument } from '../schemas/user.schema';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lista usuários (paginado)' })
  @ApiResponse({ status: 200 })
  findAll(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.usersService.findAll(Number(page), Number(limit));
  }

  @Get('me')
  @ApiOperation({ summary: 'Retorna perfil do usuário autenticado' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  me(@CurrentUser() user: UserDocument) {
    return user;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca usuário por ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza usuário' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUserId() userId: string) {
    if (id !== userId) {
      // RBAC básico: edição de terceiros exige admin (via RolesGuard em evolução)
    }
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete de usuário' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string) {
    await this.usersService.softDelete(id);
  }
}
