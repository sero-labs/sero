/**
 * Formatting and display helpers for the Starling UI.
 */

export function formatMoney(minorUnits: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minorUnits / 100);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const CATEGORY_COLORS: Record<string, string> = {
  EATING_OUT: '#f59e0b',
  GROCERIES: '#34d399',
  TRANSPORT: '#60a5fa',
  SHOPPING: '#a78bfa',
  ENTERTAINMENT: '#f87171',
  BILLS_AND_SERVICES: '#fbbf24',
  GENERAL: '#94a3b8',
  INCOME: '#34d399',
  SAVINGS: '#2dd4bf',
  TRANSFERS: '#64748b',
  PAYMENTS: '#94a3b8',
  HOUSING: '#fb923c',
  PERSONAL_CARE: '#fb7185',
  FAMILY: '#c084fc',
  HOLIDAYS: '#2dd4bf',
  CHARITY: '#60a5fa',
  NONE: '#94a3b8',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || '#94a3b8';
}

export function friendlyCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
