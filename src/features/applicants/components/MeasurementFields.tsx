import { useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { Field, Input, Select } from '@/components/ui/Field'
import {
  cmToInches,
  inchesToCm,
  kgToLb,
  lbToKg,
  sameUnit,
} from '@/utils/units'
import type { ApplicationFormValues } from '../schemas/applicationSchema'

/**
 * Height and weight, entered in whichever unit the applicant thinks in.
 *
 * One number box and a unit picker. Only the metric value is part of the form —
 * it is what the database stores (`numeric(5, 2)`, CHECK 100–250 cm and 30–250
 * kg) and what `toApplicantInsert` sends. The box holds a display value in the
 * selected unit and converts on the way in and out, so switching from kg to lb
 * re-labels *and* re-values the number already typed rather than reinterpreting
 * it as a different weight.
 *
 * Keeping the display in step with the form value is the awkward part, because
 * it is a cycle: typing sets the metric value, and a changed metric value sets
 * the display. The naive fix — an effect that recomputes the display whenever
 * the metric value changes — fights the user as they type, snapping a
 * half-entered number back.
 *
 * So the sync happens during render, React's documented way to adjust state
 * when an external value changes, guarded by a comparison rather than a flag:
 * if the incoming metric value is exactly what the current display converts to,
 * this component is the one that just produced it and the box is left precisely
 * as typed. Anything else — a restored draft, a programmatic reset — is an
 * outside change and wins.
 */

type MetricField = 'height_cm' | 'weight_kg'

interface UnitSpec {
  value: string
  label: string
  /** Bounds in this unit, mirroring the CHECK constraints in migration 0004. */
  min: number
  max: number
  toMetric: (display: string) => string
  fromMetric: (metric: string) => string
}

/**
 * Typed as a non-empty tuple so the first entry is the guaranteed default —
 * `noUncheckedIndexedAccess` would otherwise make every `units[0]` optional and
 * the fallbacks below unprovable.
 */
type UnitList = [UnitSpec, ...UnitSpec[]]

const HEIGHT_UNITS: UnitList = [
  { value: 'cm', label: 'cm', min: 100, max: 250, toMetric: sameUnit, fromMetric: sameUnit },
  { value: 'in', label: 'in', min: 39, max: 99, toMetric: inchesToCm, fromMetric: cmToInches },
]

const WEIGHT_UNITS: UnitList = [
  { value: 'kg', label: 'kg', min: 30, max: 250, toMetric: sameUnit, fromMetric: sameUnit },
  { value: 'lb', label: 'lb', min: 66, max: 551, toMetric: lbToKg, fromMetric: kgToLb },
]

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
  const [display, setDisplay] = useState(() => units[0].fromMetric(metric))
  const [lastMetric, setLastMetric] = useState(metric)

  const spec = units.find((u) => u.value === unit) ?? units[0]

  if (metric !== lastMetric) {
    setLastMetric(metric)
    if (metric !== spec.toMetric(display)) setDisplay(spec.fromMetric(metric))
  }

  function commit(nextDisplay: string, nextSpec: UnitSpec) {
    form.setValue(name, nextSpec.toMetric(nextDisplay), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  function handleDisplayChange(next: string) {
    setDisplay(next)
    commit(next, spec)
  }

  function handleUnitChange(nextValue: string) {
    const nextSpec = units.find((u) => u.value === nextValue) ?? units[0]
    setUnit(nextValue)
    // Re-express what is already there in the new unit. The stored metric value
    // is unchanged — 70 kg is still 70 kg when the box starts reading 154.3 lb.
    setDisplay(nextSpec.fromMetric(metric))
  }

  return (
    <Field
      label={label}
      error={error}
      hint={`Entered in ${spec.label}. Change the unit and the value converts.`}
    >
      {/*
        Widths come from the grid tracks, not from utilities on the controls.
        `Input` and `Select` both carry `w-full` in their own base classes, and
        `cn` is a plain joiner with no conflict resolution (see utils/cn.ts), so
        a `w-24` passed down here would not override it — both classes ship and
        `w-full` wins on stylesheet order, stretching the picker across the row.
        `minmax(0, 1fr)` keeps the number box from being pushed wider than its
        track by the default `min-width: auto` on grid items.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <Input
          type="number"
          min={spec.min}
          max={spec.max}
          step="0.1"
          inputMode="decimal"
          placeholder={spec.label}
          aria-label={`${label} in ${spec.label}`}
          value={display}
          onChange={(e) => handleDisplayChange(e.target.value)}
        />
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
