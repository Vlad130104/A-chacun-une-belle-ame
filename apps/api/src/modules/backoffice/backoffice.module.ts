import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, type ClockProvider } from '../../providers/ports';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { HASHER, type Hasher } from '../auth/application/ports';
import { AUDIT_WRITER, type AuditWriter } from '../moderation/application/ports';
import {
  ADMIN_AUDIT_READER,
  ADMIN_QUERY_REPOSITORY,
  FEATURE_FLAG_REPOSITORY,
  ROLE_REPOSITORY,
  TWO_FACTOR_REPOSITORY,
  type AdminAuditReader,
  type AdminQueryRepository,
  type FeatureFlagRepository,
  type RoleRepository,
  type TwoFactorRepository,
} from './application/ports';
import {
  AdminTwoFactorUseCase,
  GetDashboardUseCase,
  GetUserDetailUseCase,
  ManageFeatureFlagsUseCase,
  ManageRolesUseCase,
  ReadAuditLogUseCase,
  SearchUsersUseCase,
} from './application/backoffice.use-cases';
import {
  AdminTwoFactorController,
  BackofficeController,
} from './infrastructure/backoffice.controller';
import {
  PrismaAdminAuditReader,
  PrismaAdminQueryRepository,
  PrismaFeatureFlagRepository,
  PrismaRoleRepository,
  PrismaTwoFactorRepository,
} from './infrastructure/prisma.repositories';

/**
 * Module back-office (tranche D9).
 *
 * Il ne possède aucune table en propre : il lit celles des autres modules pour
 * produire des vues d'administration, et écrit uniquement dans `UserRole`,
 * `FeatureFlag` et le journal d'audit.
 *
 * C'est une exception assumée à la règle de propriété des tables : un
 * back-office qui ne pourrait pas croiser les domaines ne servirait à rien.
 * La contrepartie est que ce module est en **lecture seule** partout ailleurs —
 * les sanctions passent par le module `moderation`, les remboursements par
 * `billing`, chacun avec ses propres garde-fous.
 */
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [BackofficeController, AdminTwoFactorController],
  providers: [
    {
      provide: ADMIN_QUERY_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAdminQueryRepository(prisma),
    },
    {
      provide: ROLE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaRoleRepository(prisma),
    },
    {
      provide: FEATURE_FLAG_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaFeatureFlagRepository(prisma),
    },
    {
      provide: ADMIN_AUDIT_READER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAdminAuditReader(prisma),
    },
    {
      provide: TWO_FACTOR_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaTwoFactorRepository(prisma),
    },

    {
      provide: GetDashboardUseCase,
      inject: [ADMIN_QUERY_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (queries: AdminQueryRepository, clock: ClockProvider) =>
        new GetDashboardUseCase(queries, clock),
    },
    {
      provide: SearchUsersUseCase,
      inject: [ADMIN_QUERY_REPOSITORY, AUDIT_WRITER, HASHER, CLOCK_PROVIDER],
      useFactory: (
        queries: AdminQueryRepository,
        audit: AuditWriter,
        hasher: Hasher,
        clock: ClockProvider,
      ) => new SearchUsersUseCase(queries, audit, hasher, clock),
    },
    {
      provide: GetUserDetailUseCase,
      inject: [ADMIN_QUERY_REPOSITORY, AUDIT_WRITER, CLOCK_PROVIDER],
      useFactory: (queries: AdminQueryRepository, audit: AuditWriter, clock: ClockProvider) =>
        new GetUserDetailUseCase(queries, audit, clock),
    },
    {
      provide: ReadAuditLogUseCase,
      inject: [ADMIN_AUDIT_READER, AUDIT_WRITER, CLOCK_PROVIDER],
      useFactory: (reader: AdminAuditReader, audit: AuditWriter, clock: ClockProvider) =>
        new ReadAuditLogUseCase(reader, audit, clock),
    },
    {
      provide: ManageRolesUseCase,
      inject: [ROLE_REPOSITORY, AUDIT_WRITER, CLOCK_PROVIDER],
      useFactory: (roles: RoleRepository, audit: AuditWriter, clock: ClockProvider) =>
        new ManageRolesUseCase(roles, audit, clock),
    },
    {
      provide: ManageFeatureFlagsUseCase,
      inject: [FEATURE_FLAG_REPOSITORY, AUDIT_WRITER, CLOCK_PROVIDER],
      useFactory: (flags: FeatureFlagRepository, audit: AuditWriter, clock: ClockProvider) =>
        new ManageFeatureFlagsUseCase(flags, audit, clock),
    },
    {
      provide: AdminTwoFactorUseCase,
      inject: [TWO_FACTOR_REPOSITORY, AUDIT_WRITER, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        twoFactor: TwoFactorRepository,
        audit: AuditWriter,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new AdminTwoFactorUseCase(twoFactor, audit, clock, config.get('APP_NAME', { infer: true })),
    },
  ],
})
export class BackofficeModule {}
