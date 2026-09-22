import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function formatSeconds(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function formatKmh(mps: number): string {
  return `${Math.round(mps * 3.6)}`;
}

export function formatHeading(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return `${Math.round(deg)}° ${dirs[idx]}`;
}
