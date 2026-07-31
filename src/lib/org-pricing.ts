export interface OrgTier {
  id: "standard" | "plus" | "silver" | "gold";
  name: string;
  minSeats: number;
  maxSeats: number | null;
  monthlyRatePerSeat: number; // e.g. 20, 18, 15, 10
  discountLabel: string;
  badgeColor: string;
  badgeBg: string;
}

export const ORG_TIERS: OrgTier[] = [
  {
    id: "standard",
    name: "Standard Tier",
    minSeats: 1,
    maxSeats: 99,
    monthlyRatePerSeat: 20,
    discountLabel: "Base Rate ($20/seat/mo)",
    badgeColor: "#9ca3af",
    badgeBg: "rgba(156, 163, 175, 0.15)",
  },
  {
    id: "plus",
    name: "Plus Tier",
    minSeats: 100,
    maxSeats: 249,
    monthlyRatePerSeat: 18,
    discountLabel: "10% Volume Discount ($18/seat/mo)",
    badgeColor: "#3b82f6",
    badgeBg: "rgba(59, 130, 246, 0.15)",
  },
  {
    id: "silver",
    name: "Silver Tier",
    minSeats: 250,
    maxSeats: 499,
    monthlyRatePerSeat: 15,
    discountLabel: "25% Volume Discount ($15/seat/mo)",
    badgeColor: "#a855f7",
    badgeBg: "rgba(168, 85, 247, 0.15)",
  },
  {
    id: "gold",
    name: "Gold Tier",
    minSeats: 500,
    maxSeats: 4999,
    monthlyRatePerSeat: 10,
    discountLabel: "50% Volume Discount ($10/seat/mo)",
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
