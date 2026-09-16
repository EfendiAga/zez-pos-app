export function belongsToBusiness<T extends { businessId?: string }>(item: T, businessId: string | undefined) {
  if (!businessId) return false;
  return !item.businessId || item.businessId === businessId;
}

export function filterByBusiness<T extends { businessId?: string }>(items: T[], businessId: string | undefined) {
  return items.filter((item) => belongsToBusiness(item, businessId));
}

export function nextTableNumber(numbers: string[]) {
  const used = new Set(numbers.map((value) => Number.parseInt(value, 10)).filter((value) => Number.isFinite(value)));
  let next = 1;
  while (used.has(next)) {
    next += 1;
  }
  return `${next}`;
}

export function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
