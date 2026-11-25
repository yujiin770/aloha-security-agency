import {
  EMPTY_ROW,
  IMPORT_COLUMNS,
  IMPORT_SECTIONS,
  TEMPLATE_EXAMPLES,
  type ColumnGroup,
} from './personnelCsv'

/**
 * The personnel import template as an Excel workbook.
 *
 * A workbook rather than a CSV because it can do what typing fast needs:
 *   - every column is formatted as Text, so Pag-IBIG / PhilHealth numbers keep
 *     all their digits and 09… phone numbers keep the leading zero;
 *   - a band above the headings names the section of the Personal Data Sheet
 *     each column belongs to, in the app's order; both rows are frozen, and
 *     the headings are coloured by kind (basic, Personal Data Sheet, roster);
 *   - list cells (dependents, employers…) can hold one entry per line.
 * A second sheet, "Guide", explains every column. The importer skips it.
 */

export const GUIDE_SHEET = 'Guide'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const colLetter = (index: number) => {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

// Style indexes into cellXfs below.
const S_TEXT = 1
const S_HEAD = { core: 2, pds: 3, roster: 4 } satisfies Record<ColumnGroup, number>
const S_WRAP = 5
const S_GUIDE_HEAD = 6
const S_BAND = 7

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="49" fontId="1" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function cell(ref: string, value: string, style: number) {
  if (!value) return `<c r="${ref}" s="${style}"/>`
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
}

/** Each section's first and last column index, in column order. */
function sectionSpans() {
  return IMPORT_SECTIONS.map((section) => {
    const indexes = IMPORT_COLUMNS.flatMap((c, i) => (c.section === section.id ? [i] : []))
    return { title: section.title, first: indexes[0]!, last: indexes[indexes.length - 1]! }
  })
}

const HEAD_ROW = 2

function personnelSheet(): string {
  const cols = IMPORT_COLUMNS.map(
    (c, i) =>
      // Grid widths are in pixels; Excel's are in characters (~7px each).
      `<col min="${i + 1}" max="${i + 1}" width="${Math.max(12, Math.round(c.width / 7))}" style="${S_TEXT}" customWidth="1"/>`,
  ).join('')

  const spans = sectionSpans()
  // Every cell of the band carries the style so the merged block is filled.
  const band = IMPORT_COLUMNS.map((_c, i) => {
    const span = spans.find((s) => s.first === i)
    return cell(`${colLetter(i)}1`, span?.title ?? '', S_BAND)
  }).join('')
  const merges = spans
    .filter((s) => s.last > s.first)
    .map((s) => `<mergeCell ref="${colLetter(s.first)}1:${colLetter(s.last)}1"/>`)

  const head = IMPORT_COLUMNS.map((c, i) =>
    cell(`${colLetter(i)}${HEAD_ROW}`, `${c.header}${'required' in c && c.required ? ' *' : ''}`, S_HEAD[c.group]),
  ).join('')

  const body = TEMPLATE_EXAMPLES.map((example, r) => {
    const n = r + HEAD_ROW + 1
    const values = { ...EMPTY_ROW, ...example }
    // List cells: one entry per line, as staff are asked to type them.
    const cells = IMPORT_COLUMNS.map((c, i) =>
      cell(`${colLetter(i)}${n}`, values[c.key].replace(/ \| /g, '\n'), S_TEXT),
    ).join('')
    return `<row r="${n}">${cells}</row>`
  }).join('')

  const last = colLetter(IMPORT_COLUMNS.length - 1)
  const firstData = `C${HEAD_ROW + 1}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${last}${TEMPLATE_EXAMPLES.length + HEAD_ROW}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane xSplit="2" ySplit="${HEAD_ROW}" topLeftCell="${firstData}" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="${firstData}" sqref="${firstData}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData><row r="1" ht="20" customHeight="1">${band}</row><row r="${HEAD_ROW}" ht="60" customHeight="1">${head}</row>${body}</sheetData>
<autoFilter ref="A${HEAD_ROW}:${last}${HEAD_ROW}"/>
<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>
</worksheet>`
}

const KIND_NAMES: Record<ColumnGroup, string> = {
  core: 'Basic (blue)',
  pds: 'Personal Data Sheet (green)',
  roster: 'Roster (yellow)',
}

const SECTION_TITLE = new Map<string, string>(IMPORT_SECTIONS.map((s) => [s.id, s.title]))

function guideSheet(): string {
  const rows: string[][] = [
    ['How to fill in the Personnel sheet', '', '', '', ''],
    ['• One row per guard. Delete the example rows (Employee no. "EXAMPLE") before uploading.', '', '', '', ''],
    ['• Columns are grouped and labelled like the Personal Data Sheet in the system (band above the headings); posting and status come last.', '', '', '', ''],
    ['• Only First name and Last name are required. Leave anything you do not have blank.', '', '', '', ''],
    ['• Dates: YYYY-MM-DD is safest; 04/30/2024 and 30 April 2024 are read too.', '', '', '', ''],
    ['• Lists (dependents, employment, trainings, references): one entry per line (Alt+Enter), parts separated by ";".', '', '', '', ''],
    ['• Upload this .xlsx file as is — saving as CSV can turn long numbers into 1.21E+11.', '', '', '', ''],
    ['', '', '', '', ''],
    ['Column', 'Section', 'Colour', 'Also accepted as a heading', 'What to enter'],
    ...IMPORT_COLUMNS.map((c) => [
      `${c.header}${'required' in c && c.required ? ' (required)' : ''}`,
      SECTION_TITLE.get(c.section) ?? '',
      KIND_NAMES[c.group],
      'aliases' in c ? c.aliases.join(', ') : '',
      'help' in c && c.help ? c.help : '',
    ]),
  ]
  const xml = rows
    .map((r, i) => {
      const style = i === 8 ? S_GUIDE_HEAD : i === 0 ? S_GUIDE_HEAD : S_WRAP
      return `<row r="${i + 1}">${r.map((v, j) => cell(`${colLetter(j)}${i + 1}`, v, style)).join('')}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="60" customWidth="1"/><col min="2" max="2" width="30" customWidth="1"/><col min="3" max="3" width="24" customWidth="1"/><col min="4" max="4" width="40" customWidth="1"/><col min="5" max="5" width="80" customWidth="1"/></cols>
<sheetData>${xml}</sheetData>
</worksheet>`
}

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets><sheet name="Personnel" sheetId="1" r:id="rId1"/><sheet name="${GUIDE_SHEET}" sheetId="2" r:id="rId2"/></sheets>
</workbook>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

/** The workbook's files, keyed by path inside the zip. Exported for testing. */
export function templateFiles(): Record<string, string> {
  return {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
    'xl/styles.xml': STYLES,
    'xl/worksheets/sheet1.xml': personnelSheet(),
    'xl/worksheets/sheet2.xml': guideSheet(),
  }
}

/** Builds the template and starts the browser download. */
export async function downloadImportTemplate(): Promise<void> {
  const { zipSync, strToU8 } = await import('fflate')
  const files = Object.fromEntries(
    Object.entries(templateFiles()).map(([path, xml]) => [path, strToU8(xml)]),
  )
  const bytes = zipSync(files, { level: 6 })
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'personnel-import-template.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
