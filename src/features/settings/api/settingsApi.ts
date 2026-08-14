import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type { Json, SettingRow } from '@/types/database.types'

/**
 * Settings repository.
 *
 * `is_public` rows are readable by the anonymous role (see the settings RLS
 * policy in 0009), which is how the public site gets the company name, phone
 * and open-positions list without an authenticated session.
 */

export type SettingsMap = Record<string, Json>

function toMap(rows: Pick<SettingRow, 'key' | 'value'>[]): SettingsMap {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export async function fetchPublicSettings(): Promise<SettingsMap> {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .eq('is_public', true)

  if (error) throw toAppError(error, 'Could not load site settings.')
  return toMap(data ?? [])
}

export async function fetchAllSettings(): Promise<SettingRow[]> {
  const { data, error } = await supabase.from('settings').select('*').order('key')
  if (error) throw toAppError(error, 'Could not load settings.')
  return data ?? []
}

export async function updateSetting(key: string, value: Json): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) throw toAppError(error, 'Could not save that setting.')
}
