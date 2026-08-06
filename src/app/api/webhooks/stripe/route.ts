import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { handleUserUpgradeToPro } from "@/lib/settings";

function getPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const periodEndSeconds = (subscription as any).current_period_end ?? (subscription as any).items?.data?.[0]?.current_period_end;
  return periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;
}

function getSubscriptionId(sub: string | Stripe.Subscription | null | undefined): string | null {
  if (!sub) return null;
  if (typeof sub === "string") return sub;
  if (typeof sub === "object" && sub.id) return sub.id;
  return null;
}

function getCustomerId(cust: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (!cust) return null;
  if (typeof cust === "string") return cust;
  if (typeof cust === "object" && cust.id) return cust.id;
  return null;
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    console.error("Stripe Webhook Verification Error:", error.message);
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  // ─── checkout.session.completed ────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // ── Organization seat purchase (One-time payment) ──
    if (session?.metadata?.organizationId) {
      const orgId = session.metadata.organizationId;
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const item = lineItems.data[0];
        const quantity = item?.quantity ?? 0;
        
        let validityDays = 30; // Default (1 Month)
        if (item?.price) {
          if (item.price.metadata?.validity_days) {
            validityDays = parseInt(item.price.metadata.validity_days, 10);
          } else if (item.price.product) {
            const product = typeof item.price.product === "string" 
              ? await stripe.products.retrieve(item.price.product) 
              : item.price.product;
            if (!("deleted" in product && product.deleted)) {
              const prod = product as Stripe.Product;
              if (prod.metadata?.validity_days) {
                validityDays = parseInt(prod.metadata.validity_days, 10);
              }
            }
          }
        }

        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (org) {
          await prisma.$transaction([
            prisma.organization.update({
              where: { id: orgId },
              data: {
                stripeCustomerId: getCustomerId(session.customer),
                seatCount: { increment: quantity },
                seatValidityDays: validityDays,
              },
            }),
            prisma.organizationActivityLog.create({
              data: {
                organizationId: orgId,
                actorId: "system",
                action: "SEAT_PURCHASED",
                metadata: { quantity, validityDays, sessionId: session.id },
              },
            }),
          ]);

          console.log(`[Stripe Webhook] Org ${orgId} purchased ${quantity} passes (valid for ${validityDays} days)`);
        } else {
          console.warn(`[Stripe Webhook] Org ${orgId} not found in database for checkout session ${session.id}`);
        }
      } catch (err) {
        console.error("Failed to process org seat purchase:", err);
      }
      return new NextResponse(null, { status: 200 });
    }

    // ── Personal (Premium) subscription ──
    if (!session?.metadata?.userId) {
      console.warn(`[Stripe Webhook] Missing metadata.userId in checkout session ${session.id}`);
      return new NextResponse(null, { status: 200 });
    }

    const userId = session.metadata.userId;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        console.warn(`[Stripe Webhook] User ${userId} not found in database for checkout session ${session.id}`);
        return new NextResponse(null, { status: 200 });
      }

      const subscriptionId = getSubscriptionId(session.subscription);

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId = getCustomerId(subscription.customer) || getCustomerId(session.customer);
        const priceId = subscription.items.data[0]?.price?.id || null;
        const periodEnd = getPeriodEnd(subscription);

        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customerId || user.stripeCustomerId,
            stripePriceId: priceId || user.stripePriceId,
            stripeCurrentPeriodEnd: periodEnd || user.stripeCurrentPeriodEnd,
            planTier: "PRO",
            subscriptionType: "PREMIUM",
          },
        });
        await handleUserUpgradeToPro(userId);
      } else {
        // One-time payment fallback
        const customerId = getCustomerId(session.customer);
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: customerId || user.stripeCustomerId,
            planTier: "PRO",
            subscriptionType: "PREMIUM",
          },
        });
        await handleUserUpgradeToPro(userId);
      }
    } catch (err) {
      console.error(`[Stripe Webhook] Error processing checkout session for user ${userId}:`, err);
    }
  }

  // ─── invoice.payment_succeeded ─────────────────────────────────────────────
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getSubscriptionId(invoice.subscription);
    const customerId = getCustomerId(invoice.customer);
    const customerEmail = invoice.customer_email;

    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        const periodEnd = getPeriodEnd(subscription);
        const subCustomerId = getCustomerId(subscription.customer) || customerId;

        // Try matching user by stripeSubscriptionId, stripeCustomerId, or customerEmail
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { stripeSubscriptionId: subscription.id },
              ...(subCustomerId ? [{ stripeCustomerId: subCustomerId }] : []),
              ...(customerEmail ? [{ email: customerEmail }] : []),
            ],
          },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: subCustomerId || user.stripeCustomerId,
              stripePriceId: priceId || user.stripePriceId,
              stripeCurrentPeriodEnd: periodEnd || user.stripeCurrentPeriodEnd,
              planTier: "PRO",
              subscriptionType: "PREMIUM",
            },
          });
          console.log(`[Stripe Webhook] Updated user ${user.id} from invoice.payment_succeeded`);
        } else {
          // Try matching organization
          const org = await prisma.organization.findFirst({
            where: {
              OR: [
                { stripeSubscriptionId: subscription.id },
                ...(subCustomerId ? [{ stripeCustomerId: subCustomerId }] : []),
              ],
            },
          });

          if (org) {
            await prisma.organization.update({
              where: { id: org.id },
              data: {
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: subCustomerId || org.stripeCustomerId,
                stripePriceId: priceId || org.stripePriceId,
                stripeCurrentPeriodEnd: periodEnd || org.stripeCurrentPeriodEnd,
              },
            });
            console.log(`[Stripe Webhook] Updated org ${org.id} from invoice.payment_succeeded`);
          } else {
            console.log(`[Stripe Webhook] invoice.payment_succeeded: No matching user or org found for subscription ${subscription.id} / customer ${subCustomerId} / email ${customerEmail}`);
          }
        }
      } catch (err) {
        console.error("[Stripe Webhook] Error processing invoice.payment_succeeded:", err);
      }
    } else {
      console.log(`[Stripe Webhook] invoice.payment_succeeded received for non-subscription invoice ${invoice.id}`);
    }
  }

  // ─── customer.subscription.updated ────────────────────────────────────────
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = getCustomerId(subscription.customer);

    try {
      const priceId = subscription.items.data[0]?.price?.id;
      const periodEnd = getPeriodEnd(subscription);

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { stripeSubscriptionId: subscription.id },
            ...(customerId ? [{ stripeCustomerId: customerId }] : []),
          ],
        },
      });

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripePriceId: priceId || user.stripePriceId,
            stripeCurrentPeriodEnd: periodEnd || user.stripeCurrentPeriodEnd,
            planTier: subscription.status === "active" ? "PRO" : user.planTier,
          },
        });
        console.log(`[Stripe Webhook] Updated user ${user.id} from customer.subscription.updated`);
      }
    } catch (err) {
      console.error("[Stripe Webhook] Error processing customer.subscription.updated:", err);
    }
  }

  // ─── customer.subscription.deleted ────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = (subscription.metadata as any)?.organizationId;
    const customerId = getCustomerId(subscription.customer);

    try {
      if (orgId) {
        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (org) {
          await prisma.organization.update({
            where: { id: orgId },
            data: {
              stripeSubscriptionId: null,
              stripePriceId: null,
              stripeCurrentPeriodEnd: null,
            },
          });
          console.log(`[Stripe Webhook] Reset org ${orgId} subscription state from customer.subscription.deleted`);
        }
      } else {
        const org = await prisma.organization.findFirst({
          where: {
            OR: [
              { stripeSubscriptionId: subscription.id },
              ...(customerId ? [{ stripeCustomerId: customerId }] : []),
            ],
          },
        });

        if (org) {
          await prisma.organization.update({
            where: { id: org.id },
            data: {
              stripeSubscriptionId: null,
              stripePriceId: null,
              stripeCurrentPeriodEnd: null,
            },
          });
          console.log(`[Stripe Webhook] Reset org ${org.id} subscription state from customer.subscription.deleted`);
        } else {
          const user = await prisma.user.findFirst({
            where: {
              OR: [
                { stripeSubscriptionId: subscription.id },
                ...(customerId ? [{ stripeCustomerId: customerId }] : []),
              ],
            },
          });

          if (user) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                planTier: "FREE",
                subscriptionType: "FREE",
                stripeSubscriptionId: null,
                stripePriceId: null,
                stripeCurrentPeriodEnd: null,
              },
            });
            console.log(`[Stripe Webhook] Reset user ${user.id} subscription state from customer.subscription.deleted`);
          }
        }
      }
    } catch (err) {
      console.error("[Stripe Webhook] Error processing customer.subscription.deleted:", err);
    }
  }

  return new NextResponse(null, { status: 200 });
}

