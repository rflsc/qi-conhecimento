import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EngineeringSpecialty, MessagingChannel } from '@qi-conhecimento/shared-types';

export class FieldQueryDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  queryText!: string;

  @ApiProperty({ enum: MessagingChannel })
  @IsEnum(MessagingChannel)
  channel!: MessagingChannel;

  @ApiProperty()
  @IsString()
  externalUserId!: string;

  @ApiPropertyOptional({ enum: EngineeringSpecialty })
  @IsOptional()
  @IsEnum(EngineeringSpecialty)
  specialtyFilter?: EngineeringSpecialty;

  @ApiPropertyOptional({
    type: [String],
    description: 'Restringe chunks que contenham qualquer uma dessas tags (ex.: eberick, nbr 6118)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagFilter?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Restringe a documentos específicos (ids Mongo)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  transcribedFromAudio?: boolean;
}

export class WhatsAppWebhookDto {
  @ApiProperty()
  @IsString()
  object!: string;

  @ApiProperty()
  entry!: unknown[];
}
