import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentSourceType,
  EngineeringSpecialty,
} from '@qi-conhecimento/shared-types';

export class CreateKnowledgeDocumentDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty({ enum: EngineeringSpecialty })
  @IsEnum(EngineeringSpecialty)
  specialty!: EngineeringSpecialty;

  @ApiProperty({ enum: DocumentSourceType })
  @IsEnum(DocumentSourceType)
  sourceType!: DocumentSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceReference?: string;

  @ApiPropertyOptional({ example: 'NBR 5410' })
  @IsOptional()
  @IsString()
  normReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  author?: string;
}

export class CreateManualContentDto {
  @ApiProperty()
  @IsString()
  documentId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty({ description: 'Conteúdo em Markdown (CMS interno — Pilar 1)' })
  @IsString()
  @MinLength(10)
  markdownContent!: string;

  @ApiProperty({ enum: EngineeringSpecialty })
  @IsEnum(EngineeringSpecialty)
  specialty!: EngineeringSpecialty;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class SearchKnowledgeDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  query!: string;

  @ApiPropertyOptional({ enum: EngineeringSpecialty })
  @IsOptional()
  @IsEnum(EngineeringSpecialty)
  specialty?: EngineeringSpecialty;
}
