/**
 * LinkLock release state machine.
 * Money never moves without a valid, explicit transition. No single party can force
 * a frozen (DISPUTED / UNDER_REVIEW) order open — only the resolution path can.
 */

export const STATES = {
  CREATED: 'CREATED',
  LOCKED: 'LOCKED',
  SHIPPED: 'SHIPPED',
  DELIVERY_WINDOW: 'DELIVERY_WINDOW',
  RELEASED: 'RELEASED',
  DISPUTED: 'DISPUTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  REVERSED: 'REVERSED',
  SPLIT: 'SPLIT',
};

export const TERMINAL = new Set([STATES.RELEASED, STATES.REVERSED, STATES.SPLIT]);

// from -> allowed next states
const TRANSITIONS = {
  CREATED: ['LOCKED'],
  LOCKED: ['SHIPPED'],
  SHIPPED: ['DELIVERY_WINDOW'],
  DELIVERY_WINDOW: ['RELEASED', 'DISPUTED'],
  DISPUTED: ['UNDER_REVIEW', 'REVERSED'], // vendor accepts → straight reverse
  UNDER_REVIEW: ['RELEASED', 'REVERSED', 'SPLIT'],
  RELEASED: [],
  REVERSED: [],
  SPLIT: [],
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export class TransitionError extends Error {
  constructor(from, to) {
    super(`Illegal state transition: ${from} → ${to}`);
    this.name = 'TransitionError';
    this.status = 409;
  }
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

export const STATE_LABELS = {
  CREATED: 'Awaiting payment',
  LOCKED: 'Funds locked & safe',
  SHIPPED: 'Shipped with proof',
  DELIVERY_WINDOW: 'Confirm window open',
  RELEASED: 'Released to vendor',
  DISPUTED: 'Disputed — funds frozen',
  UNDER_REVIEW: 'Under human review',
  REVERSED: 'Reversed to buyer',
  SPLIT: 'Split resolution',
};
