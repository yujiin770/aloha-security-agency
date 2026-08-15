import { useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { Field, Input } from '@/components/ui/Field'
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  type FeetInches,
} from '@/utils/units'
import type { ApplicationFormValues } from '../schemas/applicationSchema'

/**
 * Height and weight, enterable in either unit.
 *
 * Only the metric value is part of the form — it is what the database stores
 * and what `toApplicantInsert` sends. The imperial boxes are local state that
 * reads from and writes to it, so an applicant who thinks in feet and pounds
 * never has to convert anything by hand.
 *
 * Keeping the two in step is the whole problem here. Both directions have to
 * work, which is a cycle, and the naive fix — an effect that recomputes the
 * imperial pair whenever the metric value changes — fights the user as they
 * type: clearing the inches box sets cm, which sets inches straight back to 0.
 *
 * So the sync happens during render, React's documented way to adjust state
 * when an external value changes, and it is guarded by a comparison rather than
 * a flag: if the incoming metric value is exactly what the current imperial
 * pair converts to, this component is the one that just produced it and the
 * boxes are left precisely as typed. Anything else — the metric box, a restored
 * draft — is an outside change and wins.
 */

interface Props {
  form: UseFormReturn<ApplicationFormValues>
  error?: string
}

export function HeightField({ form, error }: Props) {
  const cm = useWatch({ control: form.control, name: 'height_cm' }) ?? ''

  const [imperial, setImperial] = useState<FeetInches>(() => cmToFeetInches(cm))
  const [lastCm, setLastCm] = useState(cm)

  if (cm !== lastCm) {
    setLastCm(cm)
    if (cm !== feetInchesToCm(imperial)) setImperial(cmToFeetInches(cm))
  }

  function setFromImperial(next: FeetInches) {
    setImperial(next)
    form.setValue('height_cm', feetInchesToCm(next), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <Field
      label="Height"
      error={error}
      hint="Enter centimetres or feet and inches — the other updates itself."
    >
      <div className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2">
        <Input
          type="number"
          min={100}
          max={250}
          step="0.1"
          inputMode="decimal"
          aria-label="Height in centimetres"
          placeholder="cm"
          {...form.register('height_cm')}
        />
        <span className="text-xs text-[var(--app-text-subtle)]">cm</span>

        <Input
          type="number"
          min={3}
          max={8}
          inputMode="numeric"
          aria-label="Height, feet"
          placeholder="ft"
          value={imperial.feet}
          onChange={(e) => setFromImperial({ ...imperial, feet: e.target.value })}
        />
        <Input
          type="number"
          min={0}
          max={11}
          inputMode="numeric"
          aria-label="Height, inches"
          placeholder="in"
          value={imperial.inches}
          onChange={(e) => setFromImperial({ ...imperial, inches: e.target.value })}
        />
      </div>
    </Field>
  )
}

export function WeightField({ form, error }: Props) {
  const kg = useWatch({ control: form.control, name: 'weight_kg' }) ?? ''

  const [pounds, setPounds] = useState(() => kgToLb(kg))
  const [lastKg, setLastKg] = useState(kg)

  if (kg !== lastKg) {
    setLastKg(kg)
    if (kg !== lbToKg(pounds)) setPounds(kgToLb(kg))
  }

  function setFromPounds(next: string) {
    setPounds(next)
    form.setValue('weight_kg', lbToKg(next), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <Field
      label="Weight"
      error={error}
      hint="Enter kilograms or pounds — the other updates itself."
    >
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
        <Input
          type="number"
          min={30}
          max={250}
          step="0.1"
          inputMode="decimal"
          aria-label="Weight in kilograms"
          placeholder="kg"
          {...form.register('weight_kg')}
        />
        <span className="text-xs text-[var(--app-text-subtle)]">kg</span>

        <Input
          type="number"
          min={66}
          max={551}
          step="0.1"
          inputMode="decimal"
          aria-label="Weight in pounds"
          placeholder="lb"
          value={pounds}
          onChange={(e) => setFromPounds(e.target.value)}
        />
        <span className="text-xs text-[var(--app-text-subtle)]">lb</span>
      </div>
    </Field>
  )
}
