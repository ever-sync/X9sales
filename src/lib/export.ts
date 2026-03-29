function escapeCsvValue(value: unknown): string {
  const normalized = value == null ? '' : String(value);
  if (/[",\n;]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const csv = [
    headers.join(';'),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(';')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
