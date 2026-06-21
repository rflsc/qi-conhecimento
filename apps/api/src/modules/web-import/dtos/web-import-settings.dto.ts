import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWebImportSettingsDto {
  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  @Max(2000)
  maxPages!: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(10)
  maxDepth!: number;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(0)
  @Max(60_000)
  rateLimitMs!: number;

  @ApiProperty({ example: 30000 })
  @IsInt()
  @Min(1000)
  @Max(120_000)
  fetchTimeoutMs!: number;

  @ApiProperty({ example: 'QiConhecimento/1.0 (+https://altoqi.com)' })
  @IsString()
  @MinLength(3)
  @Max(200)
  userAgent!: string;
}
