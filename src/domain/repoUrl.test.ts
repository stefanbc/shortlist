import { describe, expect, it } from 'vitest'
import { parseRepoUrl, repoSlug, safeRepoHref } from './repoUrl'

describe('parseRepoUrl', () => {
  it.each([
    'https://github.com/byteme/ecotrack',
    'http://github.com/byteme/ecotrack',
    'github.com/byteme/ecotrack',
    'www.github.com/byteme/ecotrack/',
    'https://github.com/byteme/ecotrack.git',
    'https://github.com/byteme/ecotrack/tree/main/src?tab=readme#top',
    '  https://github.com/byteme/ecotrack  ',
  ])('reads %s as the same repository', (input) => {
    expect(parseRepoUrl(input)).toEqual({
      ok: true,
      url: 'https://github.com/byteme/ecotrack',
      owner: 'byteme',
      repo: 'ecotrack',
    })
  })

  it.each([
    ['', 'notUrl'],
    ['nu avem încă', 'notUrl'],
    ['not-a-url', 'notUrl'],
    ['javascript:alert(1)', 'notUrl'],
    ['data:text/html,x', 'notUrl'],
    ['https://gitlab.com/byteme/ecotrack', 'notGithub'],
    ['https://github.com.evil.test/byteme/ecotrack', 'notGithub'],
    ['https://gist.github.com/byteme/abc', 'notGithub'],
    ['https://github.com', 'notRepo'],
    ['https://github.com/byteme', 'notRepo'],
    ['https://github.com/search/repositories', 'notRepo'],
    ['https://github.com/-bad-/repo', 'notRepo'],
  ])('refuses %s (%s)', (input, problem) => {
    expect(parseRepoUrl(input)).toEqual({ ok: false, problem })
  })
})

describe('repoSlug', () => {
  it('names a stored link owner/repo, and nothing else', () => {
    expect(repoSlug('https://github.com/byteme/ecotrack')).toBe('byteme/ecotrack')
    expect(repoSlug('https://example.com/x/y')).toBeNull()
    expect(repoSlug(null)).toBeNull()
  })
})

describe('safeRepoHref', () => {
  it('links a GitHub repository by its canonical address', () => {
    expect(safeRepoHref('github.com/byteme/ecotrack/tree/main')).toBe('https://github.com/byteme/ecotrack')
  })

  it('links an older, non-GitHub web address as stored', () => {
    expect(safeRepoHref('https://gitlab.com/byteme/ecotrack')).toBe('https://gitlab.com/byteme/ecotrack')
  })

  it.each(['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'not a link', '', null])(
    'never links %s',
    (value) => {
      expect(safeRepoHref(value)).toBeNull()
    },
  )
})
