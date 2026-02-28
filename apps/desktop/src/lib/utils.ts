import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatChannelLabel = (jobId: string) => {
  if (jobId === "global") return "Global channel";
  if (jobId.length <= 14) return `Server ${jobId}`;
  return `Server ${jobId.slice(0, 4)}...${jobId.slice(-4)}`;
};
