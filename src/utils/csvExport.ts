/**
 * Utility to export an array of tabular objects to a downloadable CSV file.
 */
export function exportToCsv<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T | string; header: string; format?: (row: T) => any }[],
  filename: string
) {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const headers = columns.map((col) => `"${col.header.replace(/"/g, '""')}"`).join(',');

  const rows = data.map((row) => {
    return columns
      .map((col) => {
        let val: any;
        if (col.format) {
          val = col.format(row);
        } else {
          val = row[col.key as keyof T];
        }

        if (val === undefined || val === null) {
          val = '';
        } else if (typeof val === 'object') {
          val = JSON.stringify(val);
        } else {
          val = String(val);
        }

        // Escape double quotes
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  const csvContent = [headers, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
