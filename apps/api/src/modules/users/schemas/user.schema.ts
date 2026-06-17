import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '@qi-conhecimento/shared-types';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['passwordHash'];
      delete ret['refreshTokenHash'];
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, index: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
