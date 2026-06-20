import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FieldQueryDocument, FieldQueryModel } from '../schemas/field-query.schema';

@Injectable()
export class MessagingRepository {
  constructor(
    @InjectModel(FieldQueryModel.name)
    private readonly fieldQueryModel: Model<FieldQueryDocument>,
  ) {}

  create(data: Partial<FieldQueryModel>): Promise<FieldQueryDocument> {
    return this.fieldQueryModel.create(data);
  }

  findById(id: string): Promise<FieldQueryDocument | null> {
    return this.fieldQueryModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  findPaginated(page: number, limit: number): Promise<[FieldQueryDocument[], number]> {
    return Promise.all([
      this.fieldQueryModel
        .find({ deletedAt: null })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.fieldQueryModel.countDocuments({ deletedAt: null }).exec(),
    ]);
  }
}
