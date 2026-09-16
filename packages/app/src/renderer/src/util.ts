export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 2 ** (10 * i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function fileGlyph(name: string, mime: string | null): string {
  if (mime?.startsWith('image/')) return '🖼️';
  if (mime?.startsWith('video/')) return '🎬';
  if (mime?.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📕';
  if (mime?.includes('zip') || mime?.includes('compressed') || mime?.includes('rar')) return '🗜️';
  if (mime?.startsWith('text/')) return '📄';
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (['doc', 'docx', 'odt'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  if (['ppt', 'pptx'].includes(ext)) return '📙';
  if (['exe', 'msi'].includes(ext)) return '⚙️';
  return '📄';
}

export function providerGlyph(provider: string): { text: string; className: string } {
  switch (provider) {
    case 'mega':
      return { text: 'M', className: 'badge badge-mega' };
    case 'gdrive':
      return { text: 'G', className: 'badge badge-gdrive' };
    default:
      return { text: '?', className: 'badge badge-other' };
  }
}

/** Electron wraps invoke rejections: "Error invoking remote method 'x': Error: msg". */
export function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}
