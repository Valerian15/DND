// In-memory registry of pending reaction offers (Shield, Counterspell). Each offer is a
// Promise<boolean> the resolver `await`s to decide whether to recompute / negate.
//
// Lifecycle: offer → wait up to TIMEOUT_MS for a `reaction:respond` from the target user;
// resolves to true (Yes) / false (No or timeout). Cancelled offers (one Counterspeller wins,
// the rest are rescinded) resolve to false and dispatch `reaction:cancelled` to close their UI.

import { broadcastFiltered } from './io.js';

const TIMEOUT_MS = 8000;

interface Pending {
  resolve: (accept: boolean) => void;
  timer: NodeJS.Timeout;
  campaignId: number;
  userId: number;
}

const pending = new Map<string, Pending>();
let nextOfferId = 1;

export type ReactionKind = 'shield' | 'counterspell' | 'gwm-bonus' | 'lucky';

export interface ReactionPayload {
  kind: ReactionKind;
  prompt: string;
  detail?: string;
}

// Offer a reaction to a single user in a campaign. Resolves to true on accept,
// false on decline / timeout / cancel.
export function offerReaction(campaignId: number, userId: number, payload: ReactionPayload): { offerId: string; promise: Promise<boolean> } {
  const offerId = `r-${nextOfferId++}-${Date.now()}`;
  const promise = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      const p = pending.get(offerId);
      if (!p) return;
      pending.delete(offerId);
      resolve(false);
    }, TIMEOUT_MS);
    pending.set(offerId, { resolve, timer, campaignId, userId });

    broadcastFiltered(campaignId, 'reaction:offer', {
      offer_id: offerId,
      deadline: Date.now() + TIMEOUT_MS,
      kind: payload.kind,
      prompt: payload.prompt,
      detail: payload.detail,
    }, (uid) => uid === userId);
  });
  return { offerId, promise };
}

export function resolveReaction(offerId: string, accept: boolean): void {
  const p = pending.get(offerId);
  if (!p) return;
  pending.delete(offerId);
  clearTimeout(p.timer);
  p.resolve(accept);
}

// Cancel a list of offers (used after one Counterspeller wins — the rest get rescinded).
// Emits `reaction:cancelled` so each UI closes its chip cleanly.
export function cancelOffers(offerIds: string[]): void {
  for (const offer_id of offerIds) {
    const p = pending.get(offer_id);
    if (!p) continue;
    pending.delete(offer_id);
    clearTimeout(p.timer);
    p.resolve(false);
    broadcastFiltered(p.campaignId, 'reaction:cancelled', { offer_id }, (uid) => uid === p.userId);
  }
}
