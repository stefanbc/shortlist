import { describe, expect, it } from 'vitest'
import { parseCsv, parseRegistrationRows } from '@/features/teams/parseRegistrations'
import { buildRegistrationTemplateCsv } from '@/features/teams/registrationTemplate'
import { parseWorkbook } from './parseWorkbook'
import { buildWorkbookTemplate } from './workbookTemplate'

// A template is only useful if the importer accepts it as downloaded.
describe('download templates', () => {
  it('the registrations template imports as its one example team', () => {
    const [team, ...rest] = parseRegistrationRows(parseCsv(buildRegistrationTemplateCsv()))
    expect(rest).toEqual([])
    expect(team).toMatchObject({
      name: 'Echipa Exemplu',
      members: ['Ana Popescu', 'Mihai Ionescu'],
      projectName: 'Proiect Exemplu',
      themeName: 'Smart City',
      repoUrl: 'https://github.com/echipa-exemplu/proiect-exemplu',
      issues: [],
      skip: false,
    })
  })

  it('the evaluation workbook template parses as a complete event', async () => {
    const parsed = await parseWorkbook(await (await buildWorkbookTemplate()).arrayBuffer())
    expect(parsed.teams.map((team) => team.name)).toEqual(['Echipa Exemplu 1', 'Echipa Exemplu 2'])
    expect(parsed.criteria).toHaveLength(9)
    expect(parsed.jurors).toHaveLength(6)
    expect(parsed.themes).toEqual(['Temă Exemplu'])
  })
})
