// Store purchases go through `billing`. The fake approves every purchase at once; Google Play's prepaid
// plan and the App Store's non-renewing subscription will replace it.
export interface BillingService {
  /** Resolves true when the 30-day pass was bought. */
  purchasePass(): Promise<boolean>;
}

export const fakeBilling: BillingService = {
  purchasePass: async () => true,
};

export const billing: BillingService = fakeBilling;
