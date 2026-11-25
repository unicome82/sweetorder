// Store purchases go through `billing`. The fake approves every purchase at once; Google Play's prepaid
// plan and the App Store's non-renewing subscription will replace it.
import type { Language } from '../i18n/messages';

/** Shown on the pass offer until the store's own localized price replaces it. */
export const PASS_PRICE: Record<Language, string> = { ko: '₩1,900', en: '$1.99' };

export interface BillingService {
  /** Resolves true when the item pack was bought. */
  purchasePass(): Promise<boolean>;
}

export const fakeBilling: BillingService = {
  purchasePass: async () => true,
};

export const billing: BillingService = fakeBilling;
