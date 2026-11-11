// NEXORA #085 : utilitaire de classes des composants shadcn/ui (clsx + tailwind-merge).
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
