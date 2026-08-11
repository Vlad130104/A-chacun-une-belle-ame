import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { MessageRecord, RealtimeNotifier } from '../application/ports';

export const conversationRoom = (conversationId: string): string =>
  `conversation:${conversationId}`;

/**
 * Diffuseur temps réel.
 *
 * Séparé de la passerelle pour une raison structurelle, pas esthétique : la
 * passerelle *appelle* les cas d'usage (elle reçoit `message:send`), et les cas
 * d'usage *appellent* le diffuseur. Si les deux rôles vivaient dans la même
 * classe, le graphe d'injection contiendrait un cycle
 * `RealtimeGateway → SendMessageUseCase → RealtimeGateway` — et l'application ne
 * démarrerait pas. Le test de résolution du conteneur (`app.module.spec.ts`)
 * verrouille cette propriété.
 *
 * Le serveur Socket.IO est rattaché après l'initialisation de la passerelle : ce
 * fichier ne connaît donc que l'émission, jamais la réception.
 */
@Injectable()
export class SocketRealtimeNotifier implements RealtimeNotifier {
  private readonly logger = new Logger(SocketRealtimeNotifier.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  messageCreated(conversationId: string, message: MessageRecord): void {
    // Les clés de stockage des pièces jointes ne partent jamais dans un événement :
    // le client demande une URL signée par l'API.
    this.emit(conversationId, 'message:new', {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      type: message.type,
      body: message.body,
      deliveryStatus: message.deliveryStatus,
      hasAttachment: message.attachments.length > 0,
      createdAt: message.createdAt.toISOString(),
    });
  }

  messageStatusChanged(conversationId: string, messageIds: string[], status: string): void {
    this.emit(conversationId, 'message:status', { messageIds, status });
  }

  messageDeleted(conversationId: string, messageId: string): void {
    this.emit(conversationId, 'message:deleted', { messageId });
  }

  conversationLocked(conversationId: string, reason: string): void {
    this.emit(conversationId, 'conversation:locked', { conversationId, reason });
  }

  private emit(conversationId: string, event: string, payload: unknown): void {
    if (this.server === null) {
      // Cas réel en test et pendant l'arrêt du serveur : la persistance a déjà eu
      // lieu, seule la diffusion est perdue. On le trace sans faire échouer l'envoi
      // — un message enregistré mais non diffusé se rattrape au prochain chargement
      // de l'historique, l'inverse serait irrattrapable.
      this.logger.debug(`Diffusion ignorée (${event}) : serveur temps réel absent.`);
      return;
    }

    this.server.to(conversationRoom(conversationId)).emit(event, payload);
  }
}
