import { Module } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AUDIT_WRITER } from '../moderation/application/ports';
import { PrismaAuditWriter } from './infrastructure/prisma-audit.writer';

/**
 * Module d'audit administratif.
 *
 * Propriétaire de la table `AdminAuditLog`. Il n'expose qu'une écriture ; les
 * routes de consultation arrivent avec la tranche D9, et aucune route de
 * modification ou de suppression n'existera jamais (docs/05-api.md §11).
 */
@Module({
  providers: [
    {
      provide: AUDIT_WRITER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAuditWriter(prisma),
    },
  ],
  exports: [AUDIT_WRITER],
})
export class AuditModule {}
