/**
 * Browser identity shared by chat and bets. There are no accounts: each
 * browser mints a random id (see src/lib/useTrader.ts) and sends it with every
 * call. It is soft identity: a private window gets a new one. Never trust it
 * for anything that matters.
 */

/** 32 lowercase hex chars. */
const TRADER_ID = /^[0-9a-f]{32}$/;

export function isTraderId(id: string): boolean {
  return TRADER_ID.test(id);
}

/** The public name for an id. Derived, so the server never stores a name anyone typed. */
export function handleFor(id: string): string {
  return `trader-${id.slice(0, 4)}`;
}
