import { Global, Module } from '@nestjs/common';
import { CredentialEncryptionService } from './services/credential-encryption.service';

@Global()
@Module({
  providers: [CredentialEncryptionService],
  exports: [CredentialEncryptionService],
})
export class CommonModule {}
