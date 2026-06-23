import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateLlmConfigDto {
  @IsOptional()
  @IsIn(['anthropic', 'openai'])
  llmProvider?: 'anthropic' | 'openai';

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  openaiApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  llmModel?: string;

  @IsOptional()
  @IsIn(['ollama', 'openai'])
  embeddingProvider?: 'ollama' | 'openai';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  embeddingModel?: string;
}
