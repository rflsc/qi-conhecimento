import { PartialType } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@qi-conhecimento/shared-types';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UserResponseDto {
  id!: string;
  name!: string;
  email!: string;
  role!: UserRole;
  createdAt!: Date;
  updatedAt!: Date;
}
