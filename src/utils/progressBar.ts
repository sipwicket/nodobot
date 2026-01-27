/**
 * Generate an ASCII progress bar with fixed width
 * @param current - Current progress value
 * @param total - Total value
 * @param width - Width of the progress bar (default: 20)
 * @returns Progress bar string with fixed total length
 */
export function generateProgressBar(
  current: number,
  total: number,
  width: number = 20
): string {
  if (total === 0) {
    const percentage = '100%';
    return `[${'='.repeat(width)}] ${percentage}`;
  }
  
  const percentage = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  
  // Pad percentage to 3 characters (e.g., "  0%", " 10%", "100%") to keep total length fixed
  const percentageStr = percentage.toString().padStart(3, ' ') + '%';
  
  return `[${'='.repeat(filled)}${' '.repeat(empty)}] ${percentageStr}`;
}
