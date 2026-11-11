import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import archivoBoldUrl from '@/assets/fonts/Archivo-Bold.ttf?url'
import archivoRegularUrl from '@/assets/fonts/Archivo-Regular.ttf?url'
import type { Id } from '@/domain/types'
import type { Lang } from '@/stores/preferences'
import type { ExportData } from './types'

// Static TTFs cut from the Archivo variable font (the same family the app uses): regular
// for text, and a wide bold for titles and ranks. Full files rather than the @fontsource
// webfont split, which divides glyphs across a "latin" and a "latin-ext" file -- Romanian
// needs both (â/î from Latin-1 Supplement, ă/ș/ț from Latin Extended), and a PDF font
// can't fall back between files, so the diacritics would render as tofu. This module is
// only ever reached via a dynamic import (see ExportMenu), so neither @react-pdf/renderer
// nor these fonts weigh down the main bundle.
Font.register({
  family: 'Archivo',
  fonts: [
    { src: archivoRegularUrl, fontWeight: 400 },
    { src: archivoBoldUrl, fontWeight: 700 },
  ],
})

// The app's light palette (see src/index.css): ink on paper, one highlighter.
const INK = '#11231c'
const INK_MUTED = '#4a5c53'
const INK_FAINT = '#6f7f77'
const LINE = '#d3dad5'
const MARK = '#ffe44d'

const styles = StyleSheet.create({
  page: { fontFamily: 'Archivo', padding: 40, fontSize: 10, color: INK },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 11, color: INK_MUTED, marginBottom: 20 },
  sectionHeading: { fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8 },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  // The winner is the highlighted line, as on screen.
  podiumRowFirst: { backgroundColor: MARK, borderBottomColor: MARK, borderRadius: 3 },
  podiumRank: { width: 32, fontSize: 18, fontWeight: 700 },
  podiumTeam: { flex: 1 },
  podiumTeamName: { fontSize: 13, fontWeight: 700 },
  podiumProjectName: { fontSize: 10, color: INK_MUTED },
  podiumFinal: { width: 70, textAlign: 'right', fontSize: 13, fontWeight: 700 },
  table: { marginTop: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 6 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 5,
    fontSize: 9,
    color: INK_MUTED,
  },
  colRank: { width: 28 },
  colTeam: { flex: 2 },
  colProject: { flex: 2 },
  colTheme: { flex: 2 },
  colFinal: { width: 55, textAlign: 'right' },
  colCriterion: { flex: 3 },
  colWeight: { width: 50, textAlign: 'right' },
  colAverage: { width: 60, textAlign: 'right' },
  colWeighted: { width: 60, textAlign: 'right' },
  teamHeading: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  teamMeta: { fontSize: 10, color: INK_MUTED, marginBottom: 12 },
  noShowNote: { fontSize: 11, color: INK_MUTED, marginTop: 12 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, fontSize: 8, color: INK_FAINT },
})

const STRINGS: Record<
  Lang,
  {
    results: string
    podium: string
    ranking: string
    rank: string
    team: string
    project: string
    theme: string
    final: string
    criterion: string
    weight: string
    average: string
    weighted: string
    noShow: string
    noTheme: string
    noProject: string
  }
> = {
  en: {
    results: 'Results',
    podium: 'Podium',
    ranking: 'Full ranking',
    rank: 'Rank',
    team: 'Team',
    project: 'Project',
    theme: 'Theme',
    final: 'Final',
    criterion: 'Criterion',
    weight: 'Weight',
    average: 'Average',
    weighted: 'Weighted',
    noShow: 'This team was a no-show and received no scores.',
    noTheme: '—',
    noProject: 'No project yet',
  },
  ro: {
    results: 'Rezultate',
    podium: 'Podium',
    ranking: 'Clasament complet',
    rank: 'Loc',
    team: 'Echipa',
    project: 'Proiect',
    theme: 'Tema',
    final: 'Final',
    criterion: 'Criteriu',
    weight: 'Pondere',
    average: 'Medie',
    weighted: 'Ponderat',
    noShow: 'Aceasta echipa nu s-a prezentat si nu a primit punctaj.',
    noTheme: '—',
    noProject: 'Fara proiect',
  },
}

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(3)
}

export interface ResultsPdfProps {
  data: ExportData
  lang: Lang
}

/** The PDF results report: a podium page, a full-ranking page, then one page per team
 * with its criteria breakdown -- the three views an organizer reads out or hands over
 * after the event. Pure/presentational: takes already-computed `ExportData`, same as the
 * Excel/CSV builders, so it needs no network or app context to render. */
export function ResultsPdf({ data, lang }: ResultsPdfProps) {
  const s = STRINGS[lang]
  const teamsById = new Map(data.teams.map((team) => [team.id, team]))
  const criteriaById = new Map(data.criteria.map((criterion) => [criterion.id, criterion]))
  const podium = data.ranked.filter((entry) => entry.rank !== null && entry.rank <= 3)

  function themeNameFor(themeId: Id | null): string {
    if (!themeId) return s.noTheme
    return data.themeNames[themeId] ?? s.noTheme
  }

  return (
    <Document title={`${s.results} — ${data.eventName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.eventName}</Text>
        <Text style={styles.subtitle}>{s.results}</Text>

        <Text style={styles.sectionHeading}>{s.podium}</Text>
        {podium.map((entry) => {
          const team = teamsById.get(entry.teamId)
          return (
            <View
              key={entry.teamId}
              style={entry.rank === 1 ? [styles.podiumRow, styles.podiumRowFirst] : styles.podiumRow}
            >
              <Text style={styles.podiumRank}>{entry.rank}</Text>
              <View style={styles.podiumTeam}>
                <Text style={styles.podiumTeamName}>{team?.name ?? entry.teamId}</Text>
                <Text style={styles.podiumProjectName}>{team?.project.name ?? s.noProject}</Text>
              </View>
              <Text style={styles.podiumFinal}>{formatScore(entry.final)}</Text>
            </View>
          )
        })}

        <Text style={styles.sectionHeading}>{s.ranking}</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow} fixed>
            <Text style={styles.colRank}>{s.rank}</Text>
            <Text style={styles.colTeam}>{s.team}</Text>
            <Text style={styles.colProject}>{s.project}</Text>
            <Text style={styles.colTheme}>{s.theme}</Text>
            <Text style={styles.colFinal}>{s.final}</Text>
          </View>
          {data.ranked.map((entry) => {
            const team = teamsById.get(entry.teamId)
            return (
              <View key={entry.teamId} style={styles.tableRow} wrap={false}>
                <Text style={styles.colRank}>{entry.rank ?? '—'}</Text>
                <Text style={styles.colTeam}>{team?.name ?? entry.teamId}</Text>
                <Text style={styles.colProject}>{team?.project.name ?? s.noProject}</Text>
                <Text style={styles.colTheme}>{themeNameFor(team?.project.themeId ?? null)}</Text>
                <Text style={styles.colFinal}>{formatScore(entry.final)}</Text>
              </View>
            )
          })}
        </View>
      </Page>

      {data.ranked.map((entry) => {
        const team = teamsById.get(entry.teamId)
        if (!team) return null
        return (
          <Page key={entry.teamId} size="A4" style={styles.page}>
            <Text style={styles.teamHeading}>{team.name}</Text>
            <Text style={styles.teamMeta}>
              {team.project.name ?? s.noProject} · {themeNameFor(team.project.themeId)} ·{' '}
              {s.rank} {entry.rank ?? '—'} · {s.final} {formatScore(entry.final)}
            </Text>

            {team.noShow ? (
              <Text style={styles.noShowNote}>{s.noShow}</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  <Text style={styles.colCriterion}>{s.criterion}</Text>
                  <Text style={styles.colWeight}>{s.weight}</Text>
                  <Text style={styles.colAverage}>{s.average}</Text>
                  <Text style={styles.colWeighted}>{s.weighted}</Text>
                </View>
                {entry.criteria.map((result) => {
                  const criterion = criteriaById.get(result.criterionId)
                  return (
                    <View key={result.criterionId} style={styles.tableRow} wrap={false}>
                      <Text style={styles.colCriterion}>{criterion?.name ?? result.criterionId}</Text>
                      <Text style={styles.colWeight}>{criterion?.weight ?? ''}</Text>
                      <Text style={styles.colAverage}>{formatScore(result.average)}</Text>
                      <Text style={styles.colWeighted}>{formatScore(result.weighted)}</Text>
                    </View>
                  )
                })}
              </View>
            )}
          </Page>
        )
      })}
    </Document>
  )
}
