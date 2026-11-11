import { MAX_MEMBERS } from './parseRegistrations'

/** The registration form's columns, in the order its responses sheet has them. The
 * importer only reads some of them (team, member names, project, theme, description,
 * repository) but the template carries them all, so it can be pasted over or compared
 * with a real export without the columns shifting. */
export const REGISTRATION_HEADERS: string[] = [
  'Timestamp',
  'Numele echipei',
  'Număr de telefon',
  ...Array.from({ length: MAX_MEMBERS }, (_, index) => index + 1).flatMap((n) => [
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

/** One made-up team, so the expected content of each imported column is visible. */
const EXAMPLE: Record<string, string> = {
  'Numele echipei': 'Echipa Exemplu',
  'Nume complet - Membru echipă 1': 'Ana Popescu',
  'Nume complet - Membru echipă 2': 'Mihai Ionescu',
  'Numele proiectului': 'Proiect Exemplu',
  'Tema proiectului': 'Smart City',
  'Scopul și conceptul proiectului': 'O descriere scurtă a proiectului: ce problemă rezolvă și cum.',
  'Repository Github': 'https://github.com/echipa-exemplu/proiect-exemplu',
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** The template as CSV text: the header row and the example team. Starts with a byte
 * order mark so Excel reads the Romanian letters correctly. */
export function buildRegistrationTemplateCsv(): string {
  const rows = [REGISTRATION_HEADERS, REGISTRATION_HEADERS.map((header) => EXAMPLE[header] ?? '')]
  return `${String.fromCharCode(0xfeff)}${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export const REGISTRATION_TEMPLATE_FILENAME = 'shortlist-registrations-template.csv'
