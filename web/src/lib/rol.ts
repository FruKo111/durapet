export const ROLLER = {
  ADMIN: 1,
  VETERINER: 2,
  HAYVAN_SAHIBI: 3,
} as const;

export function rolYolu(rolId: number): string {
  if (rolId === ROLLER.ADMIN) return "/admin";
  if (rolId === ROLLER.VETERINER) return "/veteriner";
  if (rolId === ROLLER.HAYVAN_SAHIBI) return "/sahip";
  return "/giris";
}

