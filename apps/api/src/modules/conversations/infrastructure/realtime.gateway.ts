import { Inject, Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { ErrorCode } from '@acuba/contracts';
import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import { BusinessError } from '../../../common/errors/business.error';
import { TOKEN_SERVICE, type TokenService } from '../../auth/application/ports';
import {
  ConversationAccessService,
  MarkReadUseCase,
  SendMessageUseCase,
} from '../application/conversation.use-cases';
import { conversationRoom, SocketRealtimeNotifier } from './socket-realtime.notifier';

const joinSchema = z.object({ conversationId: z.string().min(10).max(40) }).strict();

const sendSchema = z
  .object({
    conversationId: z.string().min(10).max(40),
    body: z.string().min(1).max(8000),
    clientIdempotencyKey: z.string().min(8).max(100),
  })
  .strict();

const readSchema = z
  .object({
    conversationId: z.string().min(10).max(40),
    messageId: z.string().min(10).max(40),
  })
  .strict();

const typingSchema = z.object({ conversationId: z.string().min(10).max(40) }).strict();

interface SocketState {
  userId: string;
}

/**
 * Passerelle temps réel (story D5-01).
 *
 * Deux propriétés valent d'être énoncées, parce qu'elles sont la raison d'être de
 * ce fichier :
 *
 *  1. Le jeton est vérifié à la CONNEXION, et l'appartenance à la conversation est
 *     revalidée EN BASE à chaque `conversation:join` comme à chaque `message:send`.
 *     Un socket ouvert avant un blocage ne survit pas au blocage.
 *  2. `message:send` délègue au même `SendMessageUseCase` que la route HTTP. Il
 *     n'existe pas de chemin d'écriture propre au temps réel — c'est ce qui rend
 *     la règle centrale vérifiable sur les deux canaux à la fois.
 *
 * La diffusion, elle, vit dans `SocketRealtimeNotifier` : cette classe reçoit,
 * l'autre émet (voir le commentaire de cycle qui y est écrit).
 */
@Injectable()
@WebSocketGateway({ namespace: '/ws', cors: false })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly sockets = new WeakMap<Socket, SocketState>();

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    private readonly notifier: SocketRealtimeNotifier,
    private readonly access: ConversationAccessService,
    private readonly sendMessage: SendMessageUseCase,
    private readonly markRead: MarkReadUseCase,
  ) {}

  afterInit(server: Server): void {
    this.notifier.attach(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const handshake = socket.handshake.auth as { token?: unknown } | undefined;
    const token = typeof handshake?.token === 'string' ? handshake.token : null;

    if (token === null) {
      socket.disconnect(true);
      return;
    }

    try {
      const claims = await this.tokens.verifyAccessToken(token);
      this.sockets.set(socket, { userId: claims.sub });
    } catch {
      // Aucun détail renvoyé : un socket non authentifié est fermé, point.
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('conversation:join')
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ joined: boolean }> {
    const { conversationId } = joinSchema.parse(payload);
    const userId = this.requireUser(socket);

    // Revalidation en base : l'adhésion n'est jamais déduite de l'état du socket.
    await this.access.assertCanRead(userId, conversationId);
    await socket.join(conversationRoom(conversationId));

    return { joined: true };
  }

  @SubscribeMessage('message:send')
  async send(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): Promise<unknown> {
    const entree = sendSchema.parse(payload);
    const userId = this.requireUser(socket);

    // Exactement le même cas d'usage que POST /conversations/:id/messages.
    return this.sendMessage.execute({
      userId,
      conversationId: entree.conversationId,
      body: entree.body,
      clientIdempotencyKey: entree.clientIdempotencyKey,
    });
  }

  @SubscribeMessage('message:read')
  async read(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ updated: number }> {
    const entree = readSchema.parse(payload);
    const userId = this.requireUser(socket);

    return this.markRead.execute({
      userId,
      conversationId: entree.conversationId,
      upToMessageId: entree.messageId,
    });
  }

  @SubscribeMessage('typing:start')
  async typingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.relayTyping(socket, payload, true);
  }

  @SubscribeMessage('typing:stop')
  async typingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.relayTyping(socket, payload, false);
  }

  private async relayTyping(socket: Socket, payload: unknown, typing: boolean): Promise<void> {
    const { conversationId } = typingSchema.parse(payload);
    const userId = this.requireUser(socket);

    // Même un indicateur de saisie est revalidé : il révèle une présence.
    await this.access.assertCanRead(userId, conversationId);

    socket
      .to(conversationRoom(conversationId))
      .emit(typing ? 'typing:start' : 'typing:stop', { conversationId, userId });
  }

  private requireUser(socket: Socket): string {
    const state = this.sockets.get(socket);
    if (state === undefined) throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);
    return state.userId;
  }
}
