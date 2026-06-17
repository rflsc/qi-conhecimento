# Padrões Transversais

- Soft delete via `deletedAt` — nunca `deleteOne()`
- Logger: `nestjs-pino` — nunca `console.log`
- Eventos: `DomainEvents.*` via EventEmitter2
- ValidationPipe global: `whitelist` + `forbidNonWhitelisted`
- Erros: `HttpExceptionFilter` com formato padronizado
- Swagger obrigatório em endpoints da API
- TypeScript strict — sem `any`
