/**
 * Asks GitHub whether a repository is there for anyone to open. Jurors follow the link
 * without signing in to the team's account, so "public and found" is what matters.
 *
 *   public   GitHub serves it to an anonymous visitor
 *   missing  no public repository at that address: misspelled, deleted, or private
 *   unknown  GitHub couldn't be asked (offline, or its hourly limit for anonymous
 *            requests is used up): no verdict either way
 */
export type RepoStatus = 'public' | 'missing' | 'unknown'

export async function checkRepo(owner: string, repo: string, signal?: AbortSignal): Promise<RepoStatus> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
      // No cookies and no referrer: this is an anonymous question about a public address.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    })
    if (response.ok) return 'public'
    if (response.status === 404) return 'missing'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
