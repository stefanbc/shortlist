import { describe, expect, it } from 'vitest'
import { parseRepoUrl, repoSlug } from './repoUrl'

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
