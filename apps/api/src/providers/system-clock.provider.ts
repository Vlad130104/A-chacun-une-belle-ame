import { Injectable } from '@nestjs/common';
import type { ClockProvider } from './ports';

@Injectable()
export class SystemClock implements ClockProvider {
  now(): Date {
    // eslint-disable-next-line no-restricted-syntax -- seul point du code autorisé à lire l'horloge système
    return new Date();
  }
}

/** Horloge contrôlable, réservée aux tests. */
export class FrozenClock implements ClockProvider {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 24 * 60 * 60 * 1000);
  }

  set(date: Date): void {
    this.current = date;
  }
}
