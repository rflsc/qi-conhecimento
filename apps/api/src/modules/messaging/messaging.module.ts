import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeModule } from '@modules/knowledge/knowledge.module';
import { MessagingController } from './controllers/messaging.controller';
import { MessagingRepository } from './repositories/messaging.repository';
import { MessagingService } from './services/messaging.service';
import { FieldQueryModel, FieldQuerySchema } from './schemas/field-query.schema';

@Module({
  imports: [
    forwardRef(() => KnowledgeModule),
    MongooseModule.forFeature([{ name: FieldQueryModel.name, schema: FieldQuerySchema }]),
  ],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingRepository],
  exports: [MessagingService],
})
export class MessagingModule {}
