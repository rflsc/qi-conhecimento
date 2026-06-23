import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmConfig, LlmConfigSchema } from './schemas/llm-config.schema';
import { LlmConfigRepository } from './repositories/llm-config.repository';
import { LlmConfigService } from './services/llm-config.service';
import { LlmConfigController } from './controllers/llm-config.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LlmConfig.name, schema: LlmConfigSchema }]),
  ],
  controllers: [LlmConfigController],
  providers: [LlmConfigRepository, LlmConfigService],
  exports: [LlmConfigService],
})
export class LlmConfigModule {}
