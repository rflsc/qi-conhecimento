import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from '@common/common.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { LlmConfigModule } from '@modules/llm-config/llm-config.module';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { HealthModule } from '@modules/health/health.module';
import { KnowledgeModule } from '@modules/knowledge/knowledge.module';
import { MessagingModule } from '@modules/messaging/messaging.module';
import { IngestionModule } from '@modules/ingestion/ingestion.module';
import { WebImportModule } from '@modules/web-import/web-import.module';
import { createBullRedisConnection } from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      envFilePath: [join(__dirname, '../../../.env'), '.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.token'],
      },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: createBullRedisConnection(config.getOrThrow<string>('REDIS_URL')),
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: { age: 3600, count: 100 },
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    CommonModule,
    LlmConfigModule,
    AuthModule,
    UsersModule,
    HealthModule,
    KnowledgeModule,
    MessagingModule,
    IngestionModule,
    WebImportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
