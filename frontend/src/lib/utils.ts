import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Apply jitter to a delay value to prevent synchronized reconnection storms.
 * Jitter adds randomness of ±(jitter * delay) to the base delay.
 *
 * @param delay - Base delay in milliseconds
 * @param jitter - Jitter factor (0.3 = ±30%)
 * @returns Delay with random jitter applied
 */
export function applyJitter(delay: number, jitter: number): number {
  const jitterRange = delay * jitter;
  const randomJitter = (Math.random() * 2 - 1) * jitterRange; // -jitterRange to +jitterRange
  return Math.max(0, Math.round(delay + randomJitter));
}
