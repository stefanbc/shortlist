import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  normalizeRepoUrl,
  parseCsv,
  parseRegistrationRows,
  parseRegistrations,
  RegistrationFormatError,
} from './parseRegistrations'

/** The Google Form's real column headers, in the order the responses sheet has them. */
const HEADER = [
  'Timestamp',
  'Numele echipei',
  'Număr de telefon',
  ...[1, 2, 3, 4, 5].flatMap((n) => [
    `Nume complet - Membru echipă ${n}`,
    `Adresa e-mail - Membru echipă ${n}`,
    `Vârstă - Membru echipă ${n}`,
  ]),
  'Instituția de învățământ, organizația sau compania',
  'Acord de participare pentru participanții sub 18 ani:',
  'Numele proiectului',
  'Tema proiectului',
  'Scopul și conceptul proiectului',
  'Repository Github',
  'Comentarii',
  'Regulament de participare',
  'Acord privind prelucrarea datelor cu caracter personal',
  'Acord foto-video',
]

function row(values: {
  team?: string
  members?: string[]
  project?: string
  theme?: string
  description?: string
  repo?: string
}): string[] {
  const cells = HEADER.map(() => '')
  cells[0] = '11/5/2026 10:00:00'
  cells[1] = values.team ?? ''
  cells[2] = '0700 000 000'
  ;(values.members ?? []).forEach((member, index) => {
    cells[3 + index * 3] = member
    cells[4 + index * 3] = `member${index}@example.com`
    cells[5 + index * 3] = '17'
  })
  cells[HEADER.indexOf('Numele proiectului')] = values.project ?? ''
  cells[HEADER.indexOf('Tema proiectului')] = values.theme ?? ''
  cells[HEADER.indexOf('Scopul și conceptul proiectului')] = values.description ?? ''
  cells[HEADER.indexOf('Repository Github')] = values.repo ?? ''
  return cells
}

describe('parseRegistrationRows', () => {
  it('keeps the team, member names and project, and nothing personal', () => {
    const [team] = parseRegistrationRows([
      HEADER,
      row({
        team: '  Byte  Me ',
        members: ['Ana Pop', 'Dan Rusu', 'Ioana Stan'],
        project: 'EcoTrack',
        theme: 'Smart City',
        description: 'Tracks waste.\nSecond line.',
        repo: 'https://github.com/byteme/ecotrack',
      }),
    ])
    expect(team).toEqual({
      row: 2,
      name: 'Byte Me',
      members: ['Ana Pop', 'Dan Rusu', 'Ioana Stan'],
      projectName: 'EcoTrack',
      themeName: 'Smart City',
      description: 'Tracks waste.\nSecond line.',
      repoUrl: 'https://github.com/byteme/ecotrack',
      issues: [],
      skip: false,
    })
    expect(JSON.stringify(team)).not.toMatch(/example\.com|0700|"17"/)
  })

  it('skips a row without a team name and blank rows', () => {
    const parsed = parseRegistrationRows([HEADER, row({ members: ['Ana'] }), HEADER.map(() => ''), row({ team: 'Ok' })])
    expect(parsed.map((entry) => [entry.name, entry.skip, entry.issues])).toEqual([
      ['', true, ['missingName']],
      ['Ok', false, []],
    ])
  })

  it('keeps the later answer when a team registered twice', () => {
    const parsed = parseRegistrationRows([
      HEADER,
      row({ team: 'Echipa Ștefan', project: 'Old' }),
      row({ team: 'echipa stefan', project: 'New' }),
    ])
    expect(parsed[0]).toMatchObject({ skip: true, issues: ['duplicateInFile'] })
    expect(parsed[1]).toMatchObject({ skip: false, projectName: 'New' })
  })

  it('skips a team that is already in the event', () => {
    const [team] = parseRegistrationRows([HEADER, row({ team: 'Byte Me' })], ['byte me'])
    expect(team).toMatchObject({ skip: true, issues: ['alreadyInEvent'] })
  })

  it('imports a team with an unusable repository answer, without the link', () => {
    const [team] = parseRegistrationRows([HEADER, row({ team: 'A', repo: 'nu avem inca' })])
    expect(team).toMatchObject({ skip: false, repoUrl: null, issues: ['badRepoUrl'] })
  })

  it('cuts a description that is too long', () => {
    const [team] = parseRegistrationRows([HEADER, row({ team: 'A', description: 'x'.repeat(6000) })])
    expect(team.description).toHaveLength(5000)
    expect(team.issues).toEqual(['descriptionTrimmed'])
  })

  it('rejects a sheet with no team name column or no answers', () => {
    expect(() => parseRegistrationRows([['Name', 'Email'], ['a', 'b']])).toThrowError(RegistrationFormatError)
    expect(() => parseRegistrationRows([HEADER])).toThrowError(RegistrationFormatError)
  })
})

describe('normalizeRepoUrl', () => {
  it('adds the scheme to a bare host and rejects scripts', () => {
    expect(normalizeRepoUrl('github.com/a/b')).toBe('https://github.com/a/b')
    expect(normalizeRepoUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeRepoUrl('')).toBeNull()
  })
})

describe('parseCsv', () => {
  it('handles quotes, commas and line breaks inside a field', () => {
    expect(parseCsv('﻿a,"b, ""c""\nd"\r\ne,f\n')).toEqual([
      ['a', 'b, "c"\nd'],
      ['e', 'f'],
    ])
  })
})

describe('parseRegistrations', () => {
  it('reads the same sheet as .xlsx and as .csv', async () => {
    const rows = [HEADER, row({ team: 'Byte Me', members: ['Ana Pop'], repo: 'github.com/a/b' })]

    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Form Responses 1').addRows(rows)
    const xlsx = (await workbook.xlsx.writeBuffer()) as ArrayBuffer

    const csv = new TextEncoder().encode(
      rows.map((cells) => cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n'),
    ).buffer as ArrayBuffer

    for (const data of [xlsx, csv]) {
      const [team] = await parseRegistrations(data)
      expect(team).toMatchObject({ name: 'Byte Me', members: ['Ana Pop'], repoUrl: 'https://github.com/a/b' })
    }
  })
})
