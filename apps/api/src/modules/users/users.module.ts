import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './controllers/users.controller';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './services/users.service';
import { AdminSeedService } from './services/admin-seed.service';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, AdminSeedService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
