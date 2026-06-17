import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase(), deletedAt: null })
      .select('+passwordHash +refreshTokenHash')
      .exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  findAll(page: number, limit: number): Promise<[UserDocument[], number]> {
    return Promise.all([
      this.userModel
        .find({ deletedAt: null })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.userModel.countDocuments({ deletedAt: null }).exec(),
    ]);
  }

  updateById(id: string, data: Partial<User>): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate({ _id: id, deletedAt: null }, data, { new: true })
      .exec();
  }

  softDelete(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true })
      .exec();
  }

  updateRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    return this.userModel
      .updateOne({ _id: id }, { refreshTokenHash: hash ?? null })
      .exec()
      .then(() => undefined);
  }
}
