import { useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { Field, Input, Select } from '@/components/ui/Field'
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLb,
  lbToKg,
} from '@/utils/units'
import type { ApplicationFormValues } from '../schemas/applicationSchema'

/**
 * Height and weight, entered in whichever unit the applicant thinks in.
 *
 * A unit picker plus however many number boxes that unit needs — one for cm,
 * kg or lb, two for feet and inches. Only the metric value is part of the form:
 * it is what the database stores (`numeric(5, 2)`, CHECK 100–250 cm and 30–250
 * kg) and what `toApplicantInsert` sends. The boxes hold a display value in the
 * selected unit and convert on the way in and out, so switching from cm to
 * ft/in re-expresses the height already typed rather than reinterpreting the
 * number as a different measurement.
 *
 * Keeping display and form value in step is the awkward part, because it is a
 * cycle: typing sets the metric value, and a changed metric value sets the
 * display. The naive fix — an effect that recomputes the display whenever the
 * metric value changes — fights the user, snapping a half-entered number back.
 *
 * So the sync happens during render, React's documented way to adjust state
 * when an external value changes, guarded by a comparison rather than a flag:
 * if the incoming metric value is exactly what the current display converts to,
 * this component is the one that just produced it and the boxes are left
 * precisely as typed. Anything else — a restored draft, a programmatic reset —
 * is an outside change and wins.
 *
 * The comparison runs through `toMetric`, never `fromMetric`, and that is what
 * makes a half-filled pair survive: 5 feet with the inches box still empty
 * converts to the same 152.4 cm as 5′0″, so the guard sees its own value and
 * does not helpfully type a `0` into the box the user is about to fill.
 */

type MetricField = 'height_cm' | 'weight_kg'

interface UnitPart {
  /** Placeholder and accessible-name suffix, e.g. `ft`. */
  label: string
  min: number
  max: number
  step: string
}

interface UnitSpec {
  value: string
  label: string
  /** One number box per entry: [cm], [kg], [lb], or [ft, in]. */
  parts: UnitPart[]
  toMetric: (parts: string[]) => string
  fromMetric: (metric: string) => string[]
}

/**
 * Typed as a non-empty tuple so the first entry is the guaranteed default —
 * `noUncheckedIndexedAccess` would otherwise make every `units[0]` optional.
 */
type UnitList = [UnitSpec, ...UnitSpec[]]

const at = (parts: string[], index: number) => parts[index] ?? ''

const HEIGHT_UNITS: UnitList = [
  {
    value: 'cm',
    label: 'cm',
    parts: [{ label: 'cm', min: 100, max: 250, step: '0.1' }],
    toMetric: (parts) => at(parts, 0).trim(),
    fromMetric: (metric) => [metric],
  },
  {
    value: 'ftin',
    label: 'ft / in',
    parts: [
      { label: 'ft', min: 3, max: 8, step: '1' },
      { label: 'in', min: 0, max: 11, step: '1' },
    ],
    toMetric: (parts) => feetInchesToCm(at(parts, 0), at(parts, 1)),
    fromMetric: (metric) => [...cmToFeetInches(metric)],
  },
]

const WEIGHT_UNITS: UnitList = [
  {
    value: 'kg',
    label: 'kg',
    parts: [{ label: 'kg', min: 30, max: 250, step: '0.1' }],
    toMetric: (parts) => at(parts, 0).trim(),
    fromMetric: (metric) => [metric],
  },
  {
    value: 'lb',
    label: 'lb',
    parts: [{ label: 'lb', min: 66, max: 551, step: '0.1' }],
    toMetric: (parts) => lbToKg(at(parts, 0)),
    fromMetric: (metric) => [kgToLb(metric)],
  },
]

/**
 * Widths come from grid tracks, never from utilities on the controls: `Input`
 * and `Select` carry `w-full` in their own base classes and `cn` is a plain
 * joiner with no conflict resolution (see utils/cn.ts), so a `w-24` passed down
 * would not override it. `minmax(0, 1fr)` rather than `1fr` because grid items
 * default to `min-width: auto`, which would let a long value push a box wider
 * than its track.
 *
 * Written out as whole literals because Tailwind scans source text — a
 * template-built class name would never be generated.
 */
const GRID_BY_PART_COUNT: Record<number, string> = {
  1: 'grid grid-cols-[minmax(0,1fr)_7rem] gap-2',
  2: 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem] gap-2',
}

interface UnitFieldProps {
  label: string
  name: MetricField
  units: UnitList
  form: UseFormReturn<ApplicationFormValues>
  error?: string
}

function UnitField({ label, name, units, form, error }: UnitFieldProps) {
  const metric = useWatch({ control: form.control, name }) ?? ''

  const [unit, setUnit] = useState(units[0].value)
  const [display, setDisplay] = useState<string[]>(() => units[0].fromMetric(metric))
  const [lastMetric, setLastMetric] = useState(metric)

  const spec = units.find((u) => u.value === unit) ?? units[0]

  if (metric !== lastMetric) {
    setLastMetric(metric)
    if (metric !== spec.toMetric(display)) setDisplay(spec.fromMetric(metric))
  }

  function handlePartChange(index: number, value: string) {
    const next = spec.parts.map((_, i) => (i === index ? value : at(display, i)))
    setDisplay(next)
    form.setValue(name, spec.toMetric(next), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  function handleUnitChange(nextValue: string) {
    const nextSpec = units.find((u) => u.value === nextValue) ?? units[0]
    setUnit(nextValue)
    // Re-express what is already there in the new unit. The stored metric value
    // is untouched — 177.8 cm is still 177.8 cm when the boxes read 5 and 10.
    setDisplay(nextSpec.fromMetric(metric))
  }

  return (
    <Field
      label={label}
      error={error}
      hint={`Entered in ${spec.label}. Change the unit and the value converts.`}
    >
      <div className={GRID_BY_PART_COUNT[spec.parts.length] ?? GRID_BY_PART_COUNT[1]}>
        {spec.parts.map((part, index) => (
          <Input
            key={part.label}
            type="number"
            min={part.min}
            max={part.max}
            step={part.step}
            inputMode="decimal"
            placeholder={part.label}
            aria-label={`${label} in ${part.label}`}
            value={at(display, index)}
            onChange={(e) => handlePartChange(index, e.target.value)}
          />
        ))}

        <Select
          aria-label={`${label} unit`}
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value)}
          options={units.map((u) => ({ value: u.value, label: u.label }))}
        />
      </div>
    </Field>
  )
}

export function HeightField({
  form,
  error,
}: {
  form: UseFormReturn<ApplicationFormValues>
  error?: string
}) {
  return (
    <UnitField label="Height" name="height_cm" units={HEIGHT_UNITS} form={form} error={error} />
  )
}

export function WeightField({
  form,
  error,
}: {
  form: UseFormReturn<ApplicationFormValues>
  error?: string
}) {
  return (
    <UnitField label="Weight" name="weight_kg" units={WEIGHT_UNITS} form={form} error={error} />
  )
}
