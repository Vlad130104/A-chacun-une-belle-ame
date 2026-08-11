import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HealthController } from './health.controller';

/**
 * Module de santé.
 *
 * Il importe `AuthModule` pour atteindre le client Redis réellement utilisé par
 * la limitation de débit : sonder une connexion que le service n'emploie pas ne
 * dirait rien de sa santé.
 */
@Module({ imports: [AuthModule], controllers: [HealthController] })
export class HealthModule {}
