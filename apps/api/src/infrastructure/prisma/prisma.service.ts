import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Accès à PostgreSQL.
 *
 * Rappel de frontière (docs/01-architecture.md §3) : un module ne requête jamais les
 * tables d'un autre module. Les repositories d'un module n'exposent que leurs propres
 * entités, et la communication inter-modules passe par un service applicatif public
 * ou un événement de domaine.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion à PostgreSQL établie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
