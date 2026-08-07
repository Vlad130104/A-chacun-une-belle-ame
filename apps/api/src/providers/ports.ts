/**
 * Ports — interfaces des intégrations externes.
 *
 * Le métier ne connaît jamais le nom d'un fournisseur : il dépend de ces interfaces,
 * et une variable d'environnement choisit l'implémentation (docs/01-architecture.md §5).
 * Aucun `if (provider === 'x')` ne doit exister ailleurs que dans les modules
 * d'injection.
 */

export const SMS_PROVIDER = Symbol('SmsProvider');
export const KYC_PROVIDER = Symbol('KycProvider');
export const PAYMENT_PROVIDER = Symbol('PaymentProvider');
export const PUSH_PROVIDER = Symbol('PushProvider');
export const MAIL_PROVIDER = Symbol('MailProvider');
export const STORAGE_PROVIDER = Symbol('StorageProvider');
export const CONTENT_MODERATION_PROVIDER = Symbol('ContentModerationProvider');
export const CLOCK_PROVIDER = Symbol('ClockProvider');

/** Toute implémentation déclare si elle est simulée : GET /health/providers en dépend. */
export interface ProviderDescriptor {
  readonly name: string;
  readonly simulated: boolean;
}

export interface SmsProvider extends ProviderDescriptor {
  sendOtp(phoneE164: string, code: string): Promise<void>;
  sendTransactional(phoneE164: string, body: string): Promise<void>;
}

export interface KycSubmissionResult {
  providerReference: string | null;
  /** `null` lorsque la décision revient à une revue humaine. */
  automaticDecision: 'APPROVED' | 'REJECTED' | null;
  livenessScore: number | null;
  faceMatchScore: number | null;
}

export interface KycProvider extends ProviderDescriptor {
  submitDocuments(requestId: string, documentKeys: string[]): Promise<KycSubmissionResult>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export interface CheckoutInstruction {
  paymentId: string;
  providerPaymentRef: string | null;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  /** Charge utile propre au fournisseur : redirection, code USSD, message d'attente. */
  instruction: Record<string, unknown>;
}

export interface PaymentProvider extends ProviderDescriptor {
  createCheckout(input: {
    idempotencyKey: string;
    amountMinor: number;
    currency: string;
    methodType: 'MOBILE_MONEY' | 'CARD';
    msisdn?: string;
  }): Promise<CheckoutInstruction>;
  refund(providerPaymentRef: string, amountMinor: number): Promise<void>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  parseWebhook(rawBody: Buffer): { providerEventId: string; eventType: string };
}

export interface PushProvider extends ProviderDescriptor {
  sendToDevice(pushToken: string, title: string, body: string): Promise<void>;
}

export interface MailProvider extends ProviderDescriptor {
  send(to: string, subject: string, html: string): Promise<void>;
}

export interface StorageProvider extends ProviderDescriptor {
  putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  getSignedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

export interface ContentModerationProvider extends ProviderDescriptor {
  scanImage(bucket: string, key: string): Promise<{ explicit: boolean; score: number }>;
  scanText(text: string): Promise<{ flagged: boolean; categories: string[] }>;
}

/**
 * Horloge injectable : les tests de conservation, de période de grâce et
 * d'expiration avancent le temps au lieu de l'attendre (docs/09-plan-de-tests.md §10).
 */
export interface ClockProvider {
  now(): Date;
}
