/**
 * formatBytes writes a size in binary units, as an operating system shows the
 * same file: megabytes with one decimal and no trailing ".0", as the deck
 * writes them, so 25 MiB reads "25 MB" and 3.4 MiB "3.4 MB".
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${Number((kb / 1024).toFixed(1))} MB`;
}
