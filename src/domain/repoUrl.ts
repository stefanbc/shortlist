/**
 * The team's repository link. It must point at a GitHub repository, because jurors open
 * it during scoring: anything else (a profile page, a search, a file path, another site)
 * is turned away with a reason the organizer can act on.
 */

export type RepoUrlProblem =
  /** Not a web address at all ("nu avem încă", "javascript:…"). */
  | 'notUrl'
  /** A web address, but not on github.com. */
  | 'notGithub'
  /** On GitHub, but not a repository (a user page, the home page). */
  | 'notRepo'

export type RepoUrlResult =
  | { ok: true; url: string; owner: string; repo: string }
  | { ok: false; problem: RepoUrlProblem }

/** GitHub's own rules: owner is letters, digits and single hyphens; a repository name is
 * letters, digits, dots, hyphens and underscores. */
const OWNER = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const REPO = /^[\w.-]{1,100}$/
/** First path segments that are GitHub pages, never an account. */
const RESERVED_OWNERS = new Set([
  'about', 'apps', 'collections', 'explore', 'features', 'issues', 'login', 'marketplace',
  'new', 'notifications', 'orgs', 'pricing', 'pulls', 'search', 'settings', 'signup',
  'sponsors', 'topics', 'trending',
])

/**
 * Reads what was typed or pasted and returns the repository's canonical address,
 * `https://github.com/owner/repo`. Forgiving about how it was written: a missing
 * "https://", "www.", a trailing ".git" or slash, and a deeper path such as
 * "/tree/main" all lead to the same repository.
 */
export function parseRepoUrl(input: string): RepoUrlResult {
  const text = input.trim()
  if (text === '' || /\s/.test(text)) return { ok: false, problem: 'notUrl' }

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, problem: 'notUrl' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, problem: 'notUrl' }
  if (!url.hostname.includes('.')) return { ok: false, problem: 'notUrl' }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'github.com') return { ok: false, problem: 'notGithub' }

  const [owner, rawRepo] = url.pathname.split('/').filter(Boolean)
  const repo = rawRepo?.replace(/\.git$/i, '')
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || RESERVED_OWNERS.has(owner.toLowerCase())) {
    return { ok: false, problem: 'notRepo' }
  }
  return { ok: true, url: `https://github.com/${owner}/${repo}`, owner, repo }
}

/** `owner/repo` for a stored link, or null when it isn't a GitHub repository. */
export function repoSlug(url: string | null | undefined): string | null {
  if (!url) return null
  const parsed = parseRepoUrl(url)
  return parsed.ok ? `${parsed.owner}/${parsed.repo}` : null
}
