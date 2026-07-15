import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia" as any, // fallback to any if typescript definitions lag behind
  appInfo: {
    name: "Job Agent",
    version: "0.1.0",
  },
});
