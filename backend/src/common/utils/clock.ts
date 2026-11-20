/** Source of the current time. Injected so services and tests agree on "today". */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(next: Date): void {
    this.current = next;
  }
}
