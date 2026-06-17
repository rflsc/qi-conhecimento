import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDocument } from '@modules/users/schemas/user.schema';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDocument => {
    const request = ctx.switchToHttp().getRequest<{ user: UserDocument }>();
    return request.user;
  },
);

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: UserDocument }>();
    return request.user._id.toString();
  },
);
