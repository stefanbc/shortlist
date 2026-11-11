import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ParseKeys, TFunction } from 'i18next'
import { readFunctionsErrorCode } from '@/lib/functionsError'
import { supabase } from '@/lib/supabase'
import type { ParsedEvent, WorkbookFormatErrorCode } from './parseWorkbook'

/** Maps a `WorkbookFormatError.code` (thrown by `parseWorkbook`) to its translation key. */
export const WORKBOOK_ERROR_KEYS: Record<WorkbookFormatErrorCode | 'unknown', ParseKeys> = {
  not_xlsx: 'import.workbookErrors.not_xlsx',
  no_team_sheets: 'import.workbookErrors.no_team_sheets',
  no_criteria: 'import.workbookErrors.no_criteria',
  unknown: 'import.workbookErrors.unknown',
}

export function workbookErrorMessage(t: TFunction, code: WorkbookFormatErrorCode | 'unknown'): string {
  return t(WORKBOOK_ERROR_KEYS[code])
}

/** Machine-readable reasons the `import-event` edge function can refuse an import. */
const IMPORT_ERROR_CODES = ['invalid_request', 'invalid_import', 'forbidden'] as const
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number] | 'unknown'

export const IMPORT_ERROR_KEYS: Record<ImportErrorCode, ParseKeys> = {
  invalid_request: 'import.errors.invalid_request',
  invalid_import: 'import.errors.invalid_import',
  forbidden: 'import.errors.forbidden',
  unknown: 'import.errors.unknown',
}

export function importErrorMessage(t: TFunction, code: ImportErrorCode): string {
  return t(IMPORT_ERROR_KEYS[code])
}

/** Reads the code a caught `useImportEvent` rejection carries. */
export function importErrorCode(error: unknown): Promise<ImportErrorCode> {
  return readFunctionsErrorCode(error, IMPORT_ERROR_CODES)
}

/** Imports a parsed workbook as a new, locked event via the `import-event` edge function
 * (service role only -- it also creates one juror user per parsed juror, with a
 * placeholder email, before running the import in a single transaction). */
export function useImportEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      eventName,
      parsed,
    }: {
      eventName: string
      parsed: ParsedEvent
    }): Promise<string> => {
      const { data, error } = await supabase.functions.invoke<{ eventId: string }>('import-event', {
        body: { ...parsed, eventName },
      })
      if (error) throw error
      return data!.eventId
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events'] })
    },
  })
}
