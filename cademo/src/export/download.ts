/** Trigger a browser download of in-memory text content as a real file. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke a tick later so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Turn a part name into a safe file stem. */
export function safeStem(name: string): string {
  const stem = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return stem || 'pocketcad-part'
}
