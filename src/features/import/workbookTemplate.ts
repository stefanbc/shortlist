import { rankTeams } from '@/domain/scoring'
import type { Criterion, Score, Team } from '@/domain/types'
import type { ExportData } from '@/features/export/types'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'

/**
 * A filled-in example of the evaluation workbook this page imports: two made-up teams
 * scored by six jurors on nine criteria. It is produced by the same code as the Excel
 * export, so it is exactly the layout the importer reads: replace the example names,
 * weights and scores and import it. The size (nine criteria, six jurors) matches the
 * workbook the importer was written for, which keeps every cell where it expects it.
 */
export const WORKBOOK_TEMPLATE_FILENAME = 'shortlist-evaluation-template.xlsx'

export function buildTemplateData(): ExportData {
  const criteria: Criterion[] = Array.from({ length: 9 }, (_, index) => ({
    id: `criterion-${index + 1}`,
    name: `Criteriu ${index + 1}`,
    weight: 10,
    position: index + 1,
  }))
  const jurors: Profile[] = Array.from({ length: 6 }, (_, index) => ({
    id: `juror-${index + 1}`,
    displayName: `Jurat Exemplu${index + 1}`,
    email: null,
    role: 'juror',
    active: true,
  }))
  const teams: Team[] = [
    { id: 'team-1', name: 'Echipa Exemplu 1', pitchOrder: 1, noShow: false, manualTiebreak: null },
    { id: 'team-2', name: 'Echipa Exemplu 2', pitchOrder: 2, noShow: false, manualTiebreak: null },
  ]
  // Plausible, varied scores on the 1-5 scale in half steps.
  const scores: Score[] = teams.flatMap((team, teamIndex) =>
    criteria.flatMap((criterion, criterionIndex) =>
      jurors.map((juror, jurorIndex) => ({
        teamId: team.id,
        criterionId: criterion.id,
        jurorId: juror.id,
        value: 3 + ((teamIndex + criterionIndex + jurorIndex) % 5) * 0.5,
      })),
    ),
  )
  const teamsWithProject: TeamWithProject[] = teams.map((team, index) => ({
    ...team,
    members: [],
    project: {
      name: `Proiect Exemplu ${index + 1}`,
      description: 'O descriere scurtă a proiectului.',
      themeId: 'theme-1',
      repoUrl: `https://github.com/echipa-exemplu/proiect-${index + 1}`,
    },
  }))

  return {
    eventName: 'Eveniment Exemplu',
    themes: ['Temă Exemplu'],
    criteria,
    teams: teamsWithProject,
    themeNames: { 'theme-1': 'Temă Exemplu' },
    jurors,
    scores,
    ranked: rankTeams(teams, criteria, scores),
  }
}

/** Builds the template file. The workbook writer is loaded on demand. */
export async function buildWorkbookTemplate(): Promise<Blob> {
  const { buildWorkbook } = await import('@/features/export/workbook')
  return buildWorkbook(buildTemplateData())
}
