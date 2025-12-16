/**
 * Format JSON with 2-space indentation (no trailing newline)
 * NOTE: We do NOT sort keys (preserve the order as defined in generators)
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Get current Unix timestamp as string
 */
export function getTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}
