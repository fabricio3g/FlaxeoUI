import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * cn() - Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge for conflict resolution
 * @param inputs - Class values to merge (strings, objects, arrays)
 * @returns Merged class string with Tailwind conflicts resolved
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}
