import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import interFontUrl from '@/assets/fonts/Inter-Variable.ttf?url'
import type { Id } from '@/domain/types'
import type { Lang } from '@/stores/preferences'
import type { ExportData } from './types'

// A single variable TTF (the full Google Fonts source file, not the @fontsource webfont
// split which divides glyphs across a "latin" and a "latin-ext" file -- Romanian needs
// glyphs from both: â/î from Latin-1 Supplement, ă/ș/ț from Latin Extended). Registering
// it once here means every PDF this module renders can show Romanian diacritics
// correctly instead of tofu. This module is only ever reached via a dynamic import (see
// ExportMenu), so neither @react-pdf/renderer nor this font weighs down the main bundle.
Font.register({ family: 'Inter', src: interFontUrl })

const styles = StyleSheet.create({
  page: { fontFamily: 'Inter', padding: 36, fontSize: 10, color: '#1a1a1a' },
  title: { fontSize: 20, marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#555', marginBottom: 18 },
  sectionHeading: { fontSize: 14, marginTop: 18, marginBottom: 8 },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  podiumRank: { width: 32, fontSize: 16 },
  podiumTeam: { flex: 1 },
  podiumTeamName: { fontSize: 13 },
  podiumProjectName: { fontSize: 10, color: '#555' },
  podiumFinal: { width: 70, textAlign: 'right', fontSize: 13 },
  table: { marginTop: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 5 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    paddingBottom: 5,
    fontSize: 9,
    color: '#555',
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
  teamHeading: { fontSize: 16, marginBottom: 2 },
  teamMeta: { fontSize: 10, color: '#555', marginBottom: 12 },
  noShowNote: { fontSize: 11, color: '#777', marginTop: 12 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 8, color: '#999' },
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
            <View key={entry.teamId} style={styles.podiumRow}>
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
