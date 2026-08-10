import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import type { SessionRecord, SessionRepository } from './ports';

/** Déconnexion de la session courante (story D1-07). */
export class LogoutUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, this.clock.now(), 'Déconnexion demandée');
  }
}

/**
 * Déconnexion de tous les appareils.
 * Opération de sécurité : elle doit rester disponible même si l'utilisateur ne sait
 * plus quel appareil est compromis.
 */
export class LogoutAllUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string): Promise<{ revoked: number }> {
    const revoked = await this.sessions.revokeAllForUser(
      userId,
      this.clock.now(),
      'Déconnexion de tous les appareils',
    );
    return { revoked };
  }
}

export interface SessionView {
  id: string;
  current: boolean;
  deviceId: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Liste des sessions actives (story D1-07). */
export class ListSessionsUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const active = await this.sessions.listActiveByUser(userId);
    return active.map((session: SessionRecord) => ({
      id: session.id,
      current: session.id === currentSessionId,
      deviceId: session.deviceId,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
    }));
  }
}

/** Déconnexion d'un appareil précis. */
export class RevokeSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);

    // 404 plutôt que 403 : la session d'autrui ne doit pas voir son existence confirmée.
    if (session === null || session.userId !== userId) {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }

    await this.sessions.revoke(sessionId, this.clock.now(), 'Appareil déconnecté');
  }
}
