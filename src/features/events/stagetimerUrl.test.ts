import { describe, expect, it } from 'vitest'
import { parseStagetimerUrl } from './stagetimerUrl'

describe('parseStagetimerUrl', () => {
  it('accepts a viewer link, with or without the scheme', () => {
    expect(parseStagetimerUrl(' https://stagetimer.io/r/ABC123/ ')).toEqual({
      ok: true,
      url: 'https://stagetimer.io/r/ABC123/',
    })
    expect(parseStagetimerUrl('stagetimer.io/output/ABC123/')).toEqual({
      ok: true,
      url: 'https://stagetimer.io/output/ABC123/',
    })
  })

  it('treats an empty field as no timer', () => {
    expect(parseStagetimerUrl('   ')).toEqual({ ok: true, url: null })
  })

  it('upgrades http and refuses other sites, including look-alikes', () => {
    expect(parseStagetimerUrl('http://stagetimer.io/r/A/')).toEqual({
      ok: true,
      url: 'https://stagetimer.io/r/A/',
    })
    for (const bad of ['https://example.com/r/A/', 'https://stagetimer.io.evil.test/r/A/', 'javascript:alert(1)']) {
      expect(parseStagetimerUrl(bad)).toEqual({ ok: false, error: 'notStagetimer' })
    }
  })

  it('refuses a controller link', () => {
    expect(parseStagetimerUrl('https://stagetimer.io/r/ABC123/controller/?sig=x')).toEqual({
      ok: false,
      error: 'controllerLink',
    })
  })
})
