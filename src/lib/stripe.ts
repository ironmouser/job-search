import Stripe from "stripe";
import { getTierForQuantity, getDurationConfig } from "@/lib/org-pricing";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia" as any, // fallback to any if typescript definitions lag behind
  appInfo: {
    name: "Job Agent",
    version: "0.1.0",
  },
});

// ─── Organization Seat Helpers ────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for an organization purchasing seats.
 * Calculates unit price server-side from volume tier & pass duration.
 */
export async function createOrgCheckoutSession({
  organizationId,
  orgName,
  orgEmail,
  stripeCustomerId,
  quantity,
  durationMonths = 1,
  successUrl,
  cancelUrl,
}: {
  organizationId: string;
  orgName: string;
  orgEmail?: string;
  stripeCustomerId?: string | null;
  quantity: number;
  durationMonths?: number;
  successUrl: string;
  cancelUrl: string;
}) {
  let customerId = stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: orgName,
      email: orgEmail,
      metadata: { organizationId },
    });
    customerId = customer.id;
  }

  const tier = getTierForQuantity(quantity);
  const duration = getDurationConfig(durationMonths);
  const unitAmountCents = tier.monthlyRateCents * duration.months;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: `Job Agent HQ Organization Pass — ${tier.name} (${duration.label})`,
          description: `${tier.discountLabel} • ${duration.validityDays}-day Pro access per activated pass`,
          metadata: {
            validity_days: String(duration.validityDays),
            tier: tier.id,
            duration_months: String(duration.months),
          },
        },
        unit_amount: unitAmountCents,
      },
      quantity,
    },
  ];

  return stripe.checkout.sessions.create({
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ["card"],
    mode: "payment",
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    line_items: lineItems,
    metadata: {
      organizationId,
      tier: tier.id,
      durationMonths: String(duration.months),
      validityDays: String(duration.validityDays),
    },
    payment_intent_data: {
      metadata: {
        organizationId,
        tier: tier.id,
        durationMonths: String(duration.months),
        validityDays: String(duration.validityDays),
      },
    },
  });
}

/**
 * Updates an existing organization subscription's seat quantity.
 * Used when an org admin purchases additional seats outside of checkout.
 */
export async function updateOrgSubscriptionQuantity(
  stripeSubscriptionId: string,
  newQuantity: number
) {
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) throw new Error("No subscription item found");

  return stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: itemId, quantity: newQuantity }],
    proration_behavior: "create_prorations",
  });
}

// ─── Recruiter Portal Subscription Helpers ────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for a Recruiter Organization subscription.
 */
export async function createRecruiterSubscriptionCheckoutSession({
  recruiterOrgId,
  orgName,
  billingEmail,
  stripeCustomerId,
  planTier,
  priceId,
  successUrl,
  cancelUrl,
}: {
  recruiterOrgId: string;
  orgName: string;
  billingEmail?: string;
  stripeCustomerId?: string | null;
  planTier: 'STARTER' | 'PRO' | 'AGENCY';
  priceId?: string;
  successUrl: string;
  cancelUrl: string;
}) {
  let customerId = stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: orgName,
      email: billingEmail,
      metadata: { recruiterOrgId, entityType: 'RECRUITER_ORGANIZATION' },
    });
    customerId = customer.id;
  }

  const planPricing: Record<'STARTER' | 'PRO' | 'AGENCY', { name: string; amount: number; desc: string }> = {
    STARTER: { name: 'Starter Plan', amount: 9900, desc: '2 active jobs, 5 intros/mo, 1 seat' },
    PRO: { name: 'Pro Plan', amount: 24900, desc: '10 active jobs, 25 intros/mo, 3 seats, candidate alerts, collaboration, basic analytics' },
    AGENCY: { name: 'Agency Plan', amount: 49900, desc: '25 active jobs, 75 intros/mo, 10 seats, candidate alerts, collaboration, advanced analytics' },
  };

  const selectedTier = planPricing[planTier] || planPricing.STARTER;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId && priceId.startsWith('price_')
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Agent Recruiter ${selectedTier.name}`,
              description: selectedTier.desc,
            },
            unit_amount: selectedTier.amount,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ];

  return stripe.checkout.sessions.create({
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ['card'],
    mode: 'subscription',
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    line_items: lineItems,
    metadata: {
      recruiterOrgId,
      planTier,
      entityType: 'RECRUITER_ORGANIZATION',
    },
    subscription_data: {
      metadata: {
        recruiterOrgId,
        planTier,
        entityType: 'RECRUITER_ORGANIZATION',
      },
    },
  });
}

