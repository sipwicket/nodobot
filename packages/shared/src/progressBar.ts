export function generateProgressBar(current: number, total: number, width = 20): string {
  if (total === 0) return "[" + "=".repeat(width) + "]";
  const percentage = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${percentage}%`;
}

