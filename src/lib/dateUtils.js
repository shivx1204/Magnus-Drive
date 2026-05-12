/**
 * Formats a date string (YYYY-MM-DD) for display as DD/MM/YYYY.
 * Safely handles null/undefined/empty values.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string} - Formatted date as "DD/MM/YYYY" or empty string
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  // Already in DD/MM/YYYY format — return as-is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  // Legacy DD MM YYYY format — convert to DD/MM/YYYY
  if (/^\d{2} \d{2} \d{4}$/.test(dateStr)) return dateStr.replace(/ /g, '/');
  // Parse YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr; // Fallback: return unchanged
}
