import { timingSafeEqual } from 'crypto';
import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY, IS_SERVICE_KEY } from '@common/decorators/access.decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private warnedMissingKey = false;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const isServiceAccess = this.reflector.getAllAndOverride<boolean>(IS_SERVICE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Rotas de integração (Qi Agents): aceita service key; senão cai no JWT (admin).
    if (isServiceAccess && this.hasValidServiceKey(context)) return true;

    return super.canActivate(context);
  }

  private hasValidServiceKey(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('SERVICE_API_KEY');

    // Sem chave configurada: rota aberta (dev). Avisa uma vez por processo.
    if (!expected) {
      if (!this.warnedMissingKey) {
        this.warnedMissingKey = true;
        this.logger.warn(
          'SERVICE_API_KEY não configurada — rotas de integração (Qi Agents) estão abertas. Configure em produção.',
        );
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const provided = request.headers['x-service-key'];
    if (typeof provided !== 'string' || provided.length === 0) return false;

    return this.safeCompare(provided, expected);
  }

  private safeCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }
}
