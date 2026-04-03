"use client";

import { publicApiBaseUrl } from "@/lib/public-env";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiIstek<T>(
  path: string,
  token: string,
  method: "GET" | "POST" | "PATCH",
  body?: unknown
): Promise<T> {
  const response = await fetch(`${publicApiBaseUrl()}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json: Record<string, unknown> = {};
  let hamMetin = "";
  try {
    hamMetin = await response.text();
    json = hamMetin ? (JSON.parse(hamMetin) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    const temelHata =
      typeof json?.hata === "string"
        ? json.hata
        : hamMetin
          ? `API hatasi: ${hamMetin.slice(0, 220)}`
          : `API hatasi (HTTP ${response.status})`;
    const detay = Array.isArray(json?.detay) ? json.detay : [];
    const detayMetni = detay
      .map((x) => {
        if (x && typeof x === "object") {
          const alan = "alan" in x ? String(x.alan ?? "") : "";
          const mesaj = "mesaj" in x ? String(x.mesaj ?? "") : "";
          return [alan, mesaj].filter(Boolean).join(": ");
        }
        return "";
      })
      .filter(Boolean)
      .join(" | ");
    const kodMetni = typeof json?.kod === "string" ? ` [${json.kod}]` : "";
    const durumMetni = ` (HTTP ${response.status})`;
    const hataMetni = detayMetni ? `${temelHata}${kodMetni}${durumMetni} (${detayMetni})` : `${temelHata}${kodMetni}${durumMetni}`;
    throw new ApiError(hataMetni, response.status);
  }

  return (json as T) || ({} as T);
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  return apiIstek<T>(path, token, "GET");
}

export async function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  return apiIstek<T>(path, token, "POST", body);
}

export async function apiPatch<T>(path: string, token: string, body: unknown): Promise<T> {
  return apiIstek<T>(path, token, "PATCH", body);
}

