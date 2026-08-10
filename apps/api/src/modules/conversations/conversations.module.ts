import { Module } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CONVERSATION_GATEWAY } from '../discovery/application/ports';
import { PrismaConversationGateway } from './infrastructure/conversation.gateway';

/**
 * Module des conversations.
 *
 * À ce stade il n'expose que la passerelle utilisée par le matching. Les messages,
 * le temps réel et les règles d'envoi arrivent avec la tranche D5 — la frontière de
 * propriété des tables est posée dès maintenant pour éviter qu'un autre module ne
 * prenne l'habitude d'y écrire.
 */
@Module({
  providers: [
    {
      provide: CONVERSATION_GATEWAY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaConversationGateway(prisma),
    },
  ],
  exports: [CONVERSATION_GATEWAY],
})
export class ConversationsModule {}
