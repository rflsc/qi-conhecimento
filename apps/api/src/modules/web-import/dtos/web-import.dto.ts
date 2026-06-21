import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EngineeringSpecialty, WebDiscoveryStrategy } from '@qi-conhecimento/shared-types';

export class WebImportJobConfigDto {
  @ApiProperty({ example: 'https://suporte.altoqi.com.br/hc/pt-br/altoqi-eberick' })
  @IsUrl({ require_tld: false })
  seedUrl!: string;

  @ApiProperty({ enum: WebDiscoveryStrategy })
  @IsEnum(WebDiscoveryStrategy)
  discovery!: WebDiscoveryStrategy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profileId?: string;

  @ApiPropertyOptional({ default: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  maxPages?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxDepth?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sameOriginOnly?: boolean;

  @ApiPropertyOptional({ example: '/hc/pt-br/articles/' })
  @IsOptional()
  @IsString()
  pathPrefix?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class CreateWebImportJobDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty({ enum: EngineeringSpecialty })
  @IsEnum(EngineeringSpecialty)
  specialty!: EngineeringSpecialty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  normReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  author?: string;

  @ApiProperty({ type: WebImportJobConfigDto })
  @ValidateNested()
  @Type(() => WebImportJobConfigDto)
  config!: WebImportJobConfigDto;
}
