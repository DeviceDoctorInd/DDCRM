/**
 * Format numbers into Indian Rupee representation (e.g. ₹2,85,000)
 */
export function formatINR(amount: number): string {
  if (isNaN(amount)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format standard date
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Check if a date has passed
 */
export function isPastDate(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * Calculate Days Overdue:
 * If Payment Status is 'Pending' and Today > Due Date, calculate Today - Due Date in days; otherwise 0.
 */
export function calculateDaysOverdue(dueDate?: string, status?: string): number {
  if (status !== 'Pending' || !dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return 0;
  due.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - due.getTime();
  if (diffTime <= 0) return 0;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}
