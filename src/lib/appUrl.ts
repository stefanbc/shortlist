/** An absolute URL into this app: `${VITE_APP_URL}${path}`, falling back to the current
 * origin when the env var isn't set (e.g. local dev without a `.env.local`). Used for links
 * that leave the browser -- juror login links, admin magic-link redirects. */
export function appUrl(path: string): string {
  const base = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/+$/, '')
  return `${base || window.location.origin}${path}`
}
