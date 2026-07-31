import Stripe from "stripe";

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
 * Uses quantity-based pricing where each unit = 1 seat.
 */
export async function createOrgCheckoutSession({
  organizationId,
  orgName,
  orgEmail,
  stripeCustomerId,
  priceId,
  quantity,
  successUrl,
  cancelUrl,
}: {
  organizationId: string;
  orgName: string;
  orgEmail?: string;
  stripeCustomerId?: string | null;
  priceId: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
}) {
  // Create a Stripe customer for the org if one doesn't exist yet
  let customerId = stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: orgName,
      email: orgEmail,
      metadata: { organizationId },
    });
    customerId = customer.id;
  }

  return stripe.checkout.sessions.create({
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ["card"],
    mode: "payment",
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    line_items: [{ price: priceId, quantity }],
    metadata: { organizationId },
    payment_intent_data: {
      metadata: { organizationId },
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
