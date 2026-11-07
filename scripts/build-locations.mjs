#!/usr/bin/env node
/**
 * Turns the PSA location CSVs in /CSV into the static JSON files the
 * application form reads for its Region → City → Barangay dropdowns.
 *
 *   node scripts/build-locations.mjs      (or: npm run build:locations)
 *
 * Output, in public/locations/:
 *   regions.json         [{ code, name }]
 *   <regionCode>.json    { cities: [{ code, name, province }], barangays: { <cityCode>: [name] } }
 *
 * Split per region so the form only downloads the region the applicant picks
 * (tens of KB) instead of all ~42,000 barangays. Re-run after replacing the
 * CSVs with a newer PSA release.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const csvDir = join(root, 'CSV')
const outDir = join(root, 'public', 'locations')

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

function read(name) {
  return parseCsv(readFileSync(join(csvDir, name), 'utf8').replace(/^﻿/, ''))
}

/** Words that stay upper-case: roman numerals and the regions' acronyms. */
const KEEP_UPPER = new Set([
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII',
  'IV-A', 'IV-B', 'NCR', 'CAR', 'ARMM', 'BARMM', 'CALABARZON', 'MIMAROPA', 'SOCCSKSARGEN',
])
const KEEP_LOWER = new Set(['of', 'and', 'de', 'del', 'ng', 'in'])

/**
 * "CITY OF LAS PIÑAS" → "City of Las Piñas", "ALABEL (Capital)" → "Alabel (Capital)".
 * Word by word, and only words that are entirely upper-case, so already
 * mixed-case parts are left as the PSA wrote them. Used for regions,
 * provinces and cities — barangay names arrive mixed-case and contain real
 * acronyms (PHHC, NHA), so they are not touched.
 */
function titleCase(value) {
  return value
    .split(' ')
    .map((word, index) => {
      const bare = word.replace(/[()]/g, '')
      if (KEEP_UPPER.has(bare) || bare !== bare.toUpperCase()) return word
      const lower = word.toLowerCase()
      if (index > 0 && KEEP_LOWER.has(lower)) return lower
      // Capitalise after the start, a hyphen, a parenthesis or a period.
      return lower.replace(/(^|[-(.])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
    })
    .join(' ')
}

const byName = (a, b) => a.name.localeCompare(b.name, 'en')

const regions = read('refregion.csv').map((r) => ({
  code: r.regCode,
  name: titleCase(r.regDesc),
}))

// NCR is split into "districts" in the PSA data; applicants know it as Metro Manila.
const provinces = new Map()
for (const p of read('refprovince.csv')) {
  provinces.set(p.provCode, p.regCode === '13' ? 'Metro Manila' : titleCase(p.provDesc))
}

const cities = read('refcitymun.csv')
const barangays = read('refbrgy.csv')

const brgyByCity = new Map()
for (const b of barangays) {
  const list = brgyByCity.get(b.citymunCode) ?? []
  list.push(b.brgyDesc)
  brgyByCity.set(b.citymunCode, list)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'regions.json'), JSON.stringify(regions))

let totalCities = 0
let totalBarangays = 0
for (const region of regions) {
  // regDesc in refcitymun.csv actually holds the region *code*.
  const regionCities = cities
    .filter((c) => c.regDesc === region.code)
    .map((c) => ({
      code: c.citymunCode,
      // The PSA lists the City of Manila by district (Tondo, Sampaloc, …).
      // Named "Sampaloc, Manila" so it reads as the address people write.
      name: c.provCode === '1339' ? `${titleCase(c.citymunDesc)}, Manila` : titleCase(c.citymunDesc),
      province: provinces.get(c.provCode) ?? '',
    }))
    .sort(byName)

  const regionBarangays = {}
  for (const city of regionCities) {
    const names = [...new Set(brgyByCity.get(city.code) ?? [])].sort((a, b) =>
      a.localeCompare(b, 'en'),
    )
    regionBarangays[city.code] = names
    totalBarangays += names.length
  }
  totalCities += regionCities.length

  writeFileSync(
    join(outDir, `${region.code}.json`),
    JSON.stringify({ code: region.code, cities: regionCities, barangays: regionBarangays }),
  )
}

console.log(
  `locations: ${regions.length} regions, ${totalCities} cities/municipalities, ${totalBarangays} barangays → public/locations/`,
)
