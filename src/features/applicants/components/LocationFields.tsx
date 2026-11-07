import { useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Field, Input, Select } from '@/components/ui/Field'
import type { ApplicationFormValues } from '../schemas/applicationSchema'

/**
 * Region → City / municipality → Barangay, as dependent dropdowns.
 *
 * The lists are static JSON in public/locations/, generated from the PSA CSVs
 * by scripts/build-locations.mjs — not database rows. One file per region, so
 * picking a region downloads that region only (tens of KB), and the browser
 * caches it after that.
 *
 * The form still stores plain names in `region`, `province`,
 * `city_municipality` and `barangay`, exactly as the text boxes did. So the
 * database, the admin screens and a restored draft need nothing new: the
 * dropdowns find their selection by matching those names. Province is not
 * asked for — it follows from the city.
 *
 * The PSA list lags behind renamed and newly created LGUs, so "My address isn't
 * listed" switches back to free text. A restored draft whose names are not in
 * the lists opens in that mode too.
 */

interface Region {
  code: string
  name: string
}

interface City {
  code: string
  name: string
  province: string
}

interface RegionData {
  code: string
  cities: City[]
  barangays: Record<string, string[]>
}

const BASE = `${import.meta.env.BASE_URL}locations`

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}/${path}`)
  if (!response.ok) throw new Error(`Could not load ${path}`)
  return (await response.json()) as T
}

/** City label; the province is added because names repeat (San Jose, San Isidro…). */
function cityLabel(city: City) {
  return city.province && city.province !== 'Metro Manila'
    ? `${city.name} — ${city.province}`
    : city.name
}

export function LocationFields({ form }: { form: UseFormReturn<ApplicationFormValues> }) {
  const errors = form.formState.errors
  const [region, city, province, barangay] = useWatch({
    control: form.control,
    name: ['region', 'city_municipality', 'province', 'barangay'],
  })

  const regions = useQuery({
    queryKey: ['locations', 'regions'],
    queryFn: () => fetchJson<Region[]>('regions.json'),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const selectedRegion = regions.data?.find((r) => r.name === region)

  const regionData = useQuery({
    queryKey: ['locations', 'region', selectedRegion?.code],
    queryFn: () => fetchJson<RegionData>(`${selectedRegion!.code}.json`),
    enabled: Boolean(selectedRegion),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const cities = regionData.data?.cities ?? []
  const selectedCity =
    cities.find((c) => c.name === city && c.province === province) ??
    cities.find((c) => c.name === city)
  const barangays = selectedCity ? (regionData.data?.barangays[selectedCity.code] ?? []) : []

  // Manual mode: chosen by the applicant, or forced when the lists are
  // unavailable, or when restored values don't match them.
  const [manualChoice, setManualChoice] = useState(false)
  const unmatched =
    regions.isSuccess &&
    ((Boolean(region) && !selectedRegion) ||
      (regionData.isSuccess && Boolean(city) && !selectedCity))
  const manual = manualChoice || regions.isError || regionData.isError || unmatched

  function set(name: 'region' | 'city_municipality' | 'province' | 'barangay', value: string) {
    form.setValue(name, value, { shouldDirty: true, shouldValidate: name === 'city_municipality' })
  }

  if (manual) {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Region" error={errors.region?.message}>
            <Input placeholder="e.g. NCR, Region VII" {...form.register('region')} />
          </Field>
          <Field label="Province" error={errors.province?.message}>
            <Input {...form.register('province')} />
          </Field>
          <Field label="City / municipality" required error={errors.city_municipality?.message}>
            <Input {...form.register('city_municipality')} />
          </Field>
          <Field label="Barangay" error={errors.barangay?.message}>
            <Input {...form.register('barangay')} />
          </Field>
        </div>
        {!regions.isError && !regionData.isError && (
          <button
            type="button"
            onClick={() => {
              setManualChoice(false)
              for (const name of ['region', 'province', 'city_municipality', 'barangay'] as const) {
                set(name, '')
              }
            }}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            Choose from the list instead
          </button>
        )}
      </>
    )
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Region" error={errors.region?.message}>
          <Select
            value={selectedRegion?.name ?? ''}
            placeholder={regions.isLoading ? 'Loading…' : 'Select region'}
            disabled={regions.isLoading}
            options={(regions.data ?? []).map((r) => ({ value: r.name, label: r.name }))}
            onChange={(e) => {
              set('region', e.target.value)
              set('city_municipality', '')
              set('province', '')
              set('barangay', '')
            }}
          />
        </Field>

        <Field
          label="City / municipality"
          required
          error={errors.city_municipality?.message}
          hint={!selectedRegion ? 'Select a region first' : undefined}
        >
          <Select
            value={selectedCity?.code ?? ''}
            placeholder={regionData.isLoading ? 'Loading…' : 'Select city / municipality'}
            disabled={!selectedRegion || regionData.isLoading}
            options={cities.map((c) => ({ value: c.code, label: cityLabel(c) }))}
            onChange={(e) => {
              const next = cities.find((c) => c.code === e.target.value)
              set('city_municipality', next?.name ?? '')
              set('province', next?.province ?? '')
              set('barangay', '')
            }}
          />
        </Field>

        <Field
          label="Barangay"
          error={errors.barangay?.message}
          hint={!selectedCity ? 'Select a city first' : undefined}
        >
          <Select
            value={barangays.includes(barangay ?? '') ? barangay : ''}
            placeholder="Select barangay"
            disabled={!selectedCity}
            options={barangays.map((name) => ({ value: name, label: name }))}
            onChange={(e) => set('barangay', e.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-[var(--app-text-subtle)]">
          {selectedCity?.province ? `Province: ${selectedCity.province}` : ' '}
        </p>
        <button
          type="button"
          onClick={() => setManualChoice(true)}
          className="font-medium text-brand-600 hover:underline"
        >
          My address isn’t listed
        </button>
      </div>
    </>
  )
}
