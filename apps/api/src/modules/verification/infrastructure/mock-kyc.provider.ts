import { Injectable, Logger } from '@nestjs/common';
import type { KycProvider, KycSubmissionResult } from '../../../providers/ports';

/**
 * Implémentation SIMULÉE du prestataire KYC (story D2-08).
 *
 * Elle ne décide rien : elle place la demande en file et laisse un agent trancher au
 * back-office. C'est le mode nominal tant qu'aucun prestataire n'est contractualisé
 * (question Q2 du cadrage).
 *
 * Ce qu'elle ne peut PAS simuler, et qu'il ne faut pas laisser croire : la détection
 * de vivacité et la comparaison faciale automatique. Un agent humain compare une photo
 * et un selfie ; il ne détecte de façon fiable ni un masque, ni une photo d'écran
 * (docs/MOCKS.md).
 */
@Injectable()
export class MockKycProvider implements KycProvider {
  readonly name = 'MockKycProvider';
  readonly simulated = true;

  private readonly logger = new Logger(MockKycProvider.name);

  submitDocuments(requestId: string, documentKeys: string[]): Promise<KycSubmissionResult> {
    this.logger.warn(
      `[MODE TEST — aucun prestataire KYC réel] demande ${requestId}, ${documentKeys.length} pièces : revue humaine requise.`,
    );

    return Promise.resolve({
      providerReference: null,
      // `null` = aucune décision automatique. Le dossier attend un agent.
      automaticDecision: null,
      livenessScore: null,
      faceMatchScore: null,
    });
  }

  verifyWebhookSignature(): boolean {
    // Aucun webhook réel n'existe : accepter une signature ici reviendrait à ouvrir
    // une porte non authentifiée. On refuse systématiquement.
    return false;
  }
}
