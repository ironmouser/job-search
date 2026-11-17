export interface OrgTier {
  id: "standard" | "plus" | "silver" | "gold";
  name: string;
  minSeats: number;
  maxSeats: number | null;
  monthlyRatePerSeat: number; // e.g. 9.99, 8.99, 7.99, 6.99
  monthlyRateCents: number;   // integer cents to avoid float drift
  discountPercent: number;
  discountLabel: string;
  badgeColor: string;
  badgeBg: string;
}

export const PRO_MONTHLY_PRICE_CENTS = 999;
export const PRO_MONTHLY_PRICE_DISPLAY = "$9.99";

export const ORG_DURATIONS = [
  { label: "1 Month", shortLabel: "1-Mo", months: 1, validityDays: 30, discount: "" },
  { label: "3 Months", shortLabel: "3-Mo", months: 3, validityDays: 90, discount: "" },
  { label: "6 Months", shortLabel: "6-Mo", months: 6, validityDays: 180, discount: "" },
  { label: "1 Year", shortLabel: "1-Yr", months: 12, validityDays: 365, discount: "Popular" },
] as const;

export const ORG_TIERS: OrgTier[] = [
  {
    id: "standard",
    name: "Standard Tier",
    minSeats: 1,
    maxSeats: 99,
    monthlyRatePerSeat: 9.99,
    monthlyRateCents: 999,
    discountPercent: 0,
    discountLabel: "Base Rate ($9.99/seat/mo)",
    badgeColor: "#9ca3af",
    badgeBg: "rgba(156, 163, 175, 0.15)",
  },
  {
    id: "plus",
    name: "Plus Tier",
    minSeats: 100,
    maxSeats: 249,
    monthlyRatePerSeat: 8.99,
    monthlyRateCents: 899,
    discountPercent: 10,
    discountLabel: "10% Volume Discount ($8.99/seat/mo)",
    badgeColor: "#3b82f6",
    badgeBg: "rgba(59, 130, 246, 0.15)",
  },
  {
    id: "silver",
    name: "Silver Tier",
    minSeats: 250,
    maxSeats: 499,
    monthlyRatePerSeat: 7.99,
    monthlyRateCents: 799,
    discountPercent: 20,
    discountLabel: "20% Volume Discount ($7.99/seat/mo)",
    badgeColor: "#a855f7",
    badgeBg: "rgba(168, 85, 247, 0.15)",
  },
  {
    id: "gold",
    name: "Gold Tier",
    minSeats: 500,
    maxSeats: 4999,
    monthlyRatePerSeat: 6.99,
    monthlyRateCents: 699,
    discountPercent: 30,
    discountLabel: "30% Volume Discount ($6.99/seat/mo)",
    badgeColor: "#eab308",
    badgeBg: "rgba(234, 179, 8, 0.15)",
  },
];

export function getTierForQuantity(quantity: number): OrgTier {
  const qty = Math.max(1, quantity || 1);
  if (qty >= 500) return ORG_TIERS[3]; // Gold
  if (qty >= 250) return ORG_TIERS[2]; // Silver
  if (qty >= 100) return ORG_TIERS[1]; // Plus
  return ORG_TIERS[0]; // Standard
}

export function getNextTierUpgrade(quantity: number): { nextTier: OrgTier; seatsNeeded: number } | null {
  const currentTier = getTierForQuantity(quantity);
  const currentIndex = ORG_TIERS.findIndex((t) => t.id === currentTier.id);
  if (currentIndex < ORG_TIERS.length - 1) {
    const nextTier = ORG_TIERS[currentIndex + 1];
    return {
      nextTier,
      seatsNeeded: nextTier.minSeats - quantity,
    };
  }
  return null;
}

export function getDurationConfig(months: number) {
  return ORG_DURATIONS.find((d) => d.months === months) || ORG_DURATIONS[0];
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
