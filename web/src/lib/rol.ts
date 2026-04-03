export const ROLLER = {
  ADMIN: 1,
  VETERINER: 2,
  HAYVAN_SAHIBI: 3,
} as const;

export function rolYolu(rolId: number): string {
  const id = Number(rolId);
  if (!Number.isFinite(id)) return "/giris";
  if (id === ROLLER.ADMIN) return "/admin";
  if (id === ROLLER.VETERINER) return "/veteriner";
  if (id === ROLLER.HAYVAN_SAHIBI) return "/sahip";
  return "/giris";
}

