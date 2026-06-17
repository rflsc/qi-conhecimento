import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
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
