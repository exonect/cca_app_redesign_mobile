/** Project form: values, client checks that mirror the server, payload mapping and which
 * step a server error belongs to. Same rules as the web formModel; the server stays authoritative. */
import { z } from 'zod'

import type { Lookup, Project, Ref } from '@/shared/types'

export const FK_FIELDS = [
  'region', 'city', 'wc_ratio_corrected', 'retention_time', 'slump_flow', 'strength_age', 'sand_type',
  'fine_aggregate_source', 'coarse_aggregate_source', 'sand_zone', 'admixture_base',
] as const
export const M2M_FIELDS = [
  'cement_brands', 'cement_grades', 'mineral_admixtures', 'grades_of_concrete', 'wc_ratios_ssd', 'compressive_strengths',
] as const
export type FkField = (typeof FK_FIELDS)[number]
export type M2mField = (typeof M2M_FIELDS)[number]

/** Lookup category behind each field (server FK_LOOKUPS and M2M_LOOKUPS). */
export const CATEGORY: Record<FkField | M2mField, string> = {
  region: 'region', city: 'city', wc_ratio_corrected: 'wc_ratio_corrected', retention_time: 'retention_time',
  slump_flow: 'slump_flow', strength_age: 'strength_age', sand_type: 'sand_type', fine_aggregate_source: 'fine_aggregate_source',
  coarse_aggregate_source: 'coarse_aggregate_source', sand_zone: 'sand_zone', admixture_base: 'admixture_base',
  cement_brands: 'cement_brand', cement_grades: 'cement_grade', mineral_admixtures: 'mineral_admixture',
  grades_of_concrete: 'grade_of_concrete', wc_ratios_ssd: 'wc_ratio_ssd', compressive_strengths: 'compressive_strength',
}

/** Money fields: 0 or more, up to 2 decimals, and no more whole digits than the
 * server column holds (potential 10,2 so 8 digits; prices 12,2 so 10 digits). */
const optionalDecimal = (label: string, wholeDigits: number) => z.string().trim()
  .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), `Enter ${label} as a number of 0 or more, up to 2 decimals.`)
  .refine((v) => !/^\d+(\.\d{1,2})?$/.test(v) || v.split('.')[0].replace(/^0+(?=\d)/, '').length <= wholeDigits,
    `Enter ${label} with at most ${wholeDigits} digits before the decimal point.`)

export const projectSchema = z.object({
  customer_name: z.string().trim().max(256, 'Use 256 characters or fewer.'),
  project_name: z.string().trim().max(256, 'Use 256 characters or fewer.'),
  contact_person_name: z.string().trim().max(256, 'Use 256 characters or fewer.'),
  contact_email: z.string().trim().max(254, 'Use 254 characters or fewer.')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter an email address like name@company.com.'),
  contact_phone: z.string().trim().refine((v) => v === '' || /^\d{10}$/.test(v), 'Enter a 10 digit phone number, without +91 or spaces.'),
  sfdc_no: z.string().trim().refine((v) => v === '' || /^\d{6}$/.test(v), 'Enter all 6 digits of the SFDC number, including leading zeros.'),
  sales_person: z.string(),
  potential_cr: optionalDecimal('the potential', 8),
  selling_basic_price: optionalDecimal('the bulk price', 10),
  bulk_and_barrel: optionalDecimal('the barrel price', 10),
  remarks: z.string(),
  region: z.string(), city: z.string(), wc_ratio_corrected: z.string(), retention_time: z.string(), slump_flow: z.string(),
  strength_age: z.string(), sand_type: z.string(), fine_aggregate_source: z.string(), coarse_aggregate_source: z.string(),
  sand_zone: z.string(), admixture_base: z.string(),
  cement_brands: z.array(z.number()), cement_grades: z.array(z.number()), mineral_admixtures: z.array(z.number()),
  grades_of_concrete: z.array(z.number()), wc_ratios_ssd: z.array(z.number()), compressive_strengths: z.array(z.number()),
  cementitious_contents: z.array(z.number().int().min(100).max(999)),
  requirement_type: z.enum(['', 'slump', 'flow']),
})
export type ProjectFormValues = z.infer<typeof projectSchema>
export type FormField = keyof ProjectFormValues
export type FormErrors = Partial<Record<FormField, string>>

/** Extra rule for "Create project" (server: at least one price above zero, reported on selling_basic_price). */
export const PRICE_MESSAGE = 'Enter a bulk or barrel basic selling price above zero.'
export function priceMissing(v: Pick<ProjectFormValues, 'selling_basic_price' | 'bulk_and_barrel'>) {
  return ![v.selling_basic_price, v.bulk_and_barrel].some((x) => Number(x.trim() || 0) > 0)
}

export const EMPTY: ProjectFormValues = {
  customer_name: '', project_name: '', contact_person_name: '', contact_email: '', contact_phone: '', sfdc_no: '',
  sales_person: '', potential_cr: '', selling_basic_price: '', bulk_and_barrel: '', remarks: '',
  region: '', city: '', wc_ratio_corrected: '', retention_time: '', slump_flow: '', strength_age: '', sand_type: '',
  fine_aggregate_source: '', coarse_aggregate_source: '', sand_zone: '', admixture_base: '',
  cement_brands: [], cement_grades: [], mineral_admixtures: [], grades_of_concrete: [], wc_ratios_ssd: [], compressive_strengths: [],
  cementitious_contents: [], requirement_type: '',
}

export const LABELS: Record<FormField, string> = {
  customer_name: 'Customer name', project_name: 'Project name', contact_person_name: 'Contact person',
  contact_email: 'Contact email', contact_phone: 'Contact phone', sfdc_no: 'SFDC number', sales_person: 'Sales Person',
  potential_cr: 'Project potential', selling_basic_price: 'Basic selling price, bulk', bulk_and_barrel: 'Basic selling price, barrel',
  remarks: 'Remarks', region: 'Region', city: 'City', wc_ratio_corrected: 'W/C ratio, corrected',
  retention_time: 'Retention time', slump_flow: 'Target slump or flow', strength_age: 'Strength requirement age',
  sand_type: 'Sand type', fine_aggregate_source: 'Fine aggregate source', coarse_aggregate_source: 'Coarse aggregate source',
  sand_zone: 'Sand zone', admixture_base: 'Admixture base', cement_brands: 'Cement brands', cement_grades: 'Cement grades',
  mineral_admixtures: 'Mineral admixtures', grades_of_concrete: 'Grade of concrete', wc_ratios_ssd: 'W/C ratio, SSD',
  compressive_strengths: 'Compressive strength', cementitious_contents: 'Cementitious content', requirement_type: 'Requirement type',
}

export const STEP1_FIELDS: FormField[] = [
  'customer_name', 'project_name', 'contact_person_name', 'contact_email', 'contact_phone', 'sales_person', 'sfdc_no',
  'region', 'city', 'potential_cr', 'remarks',
]
/** Step 1 fields the server requires on submit (REQUIRED_ON_SUBMIT). */
export const STEP1_REQUIRED: FormField[] = [
  'customer_name', 'project_name', 'contact_person_name', 'contact_email', 'contact_phone', 'sales_person', 'sfdc_no',
  'region', 'city', 'potential_cr',
]

export const isFormField = (k: string): k is FormField => k in EMPTY

/** Format errors from the schema, one message per field. */
export function validate(v: ProjectFormValues, only?: FormField[]): FormErrors {
  const r = projectSchema.safeParse(v)
  if (r.success) return {}
  const out: FormErrors = {}
  for (const issue of r.error.issues) {
    const f = String(issue.path[0] ?? '')
    if (isFormField(f) && !out[f] && (!only || only.includes(f))) out[f] = issue.message
  }
  return out
}

/** The step holding the first error: 1 if any step 1 field has one, else 2; null for none. */
export function stepForErrors(fields: string[]): 1 | 2 | null {
  const known = fields.filter(isFormField)
  if (known.length === 0) return null
  return known.some((f) => STEP1_FIELDS.includes(f)) ? 1 : 2
}

/** Step 1 fields still empty, for "Continue" (sales_person only when the user picks it). */
export function missingStep1(v: ProjectFormValues, picksSalesPerson: boolean): FormField[] {
  return STEP1_REQUIRED.filter((f) => (f === 'sales_person' ? picksSalesPerson : true) && String(v[f]).trim() === '')
}

const id = (r: Ref | null) => (r ? String(r.id) : '')
const ids = (rs: Ref[]) => rs.map((r) => r.id)

export function fromProject(p: Project): ProjectFormValues {
  return {
    customer_name: p.customer_name, project_name: p.project_name, contact_person_name: p.contact_person_name,
    contact_email: p.contact_email, contact_phone: p.contact_phone, sfdc_no: p.sfdc_no,
    sales_person: p.sales_person ? String(p.sales_person.id) : '',
    potential_cr: p.potential_cr ?? '', selling_basic_price: p.selling_basic_price ?? '', bulk_and_barrel: p.bulk_and_barrel ?? '',
    remarks: p.remarks,
    region: id(p.region), city: id(p.city), wc_ratio_corrected: id(p.wc_ratio_corrected), retention_time: id(p.retention_time),
    slump_flow: id(p.slump_flow), strength_age: id(p.strength_age), sand_type: id(p.sand_type),
    fine_aggregate_source: id(p.fine_aggregate_source), coarse_aggregate_source: id(p.coarse_aggregate_source),
    sand_zone: id(p.sand_zone), admixture_base: id(p.admixture_base),
    cement_brands: ids(p.cement_brands), cement_grades: ids(p.cement_grades), mineral_admixtures: ids(p.mineral_admixtures),
    grades_of_concrete: ids(p.grades_of_concrete), wc_ratios_ssd: ids(p.wc_ratios_ssd), compressive_strengths: ids(p.compressive_strengths),
    cementitious_contents: [...p.cementitious_contents], requirement_type: p.requirement_type,
  }
}

/** Request body for POST /projects/ or PATCH /projects/:id/. Empty text stays "", empty numbers and lookups become null.
 * sales_person is sent only by users who pick it (the server sets it for a Sales Person). */
export function toPayload(v: ProjectFormValues, picksSalesPerson: boolean) {
  const nullable = (s: string) => (s.trim() === '' ? null : s.trim())
  const fk = (s: string) => (s === '' ? null : Number(s))
  const body: Record<string, unknown> = {
    customer_name: v.customer_name.trim(), project_name: v.project_name.trim(), contact_person_name: v.contact_person_name.trim(),
    contact_email: v.contact_email.trim(), contact_phone: v.contact_phone.trim(), sfdc_no: v.sfdc_no.trim(),
    potential_cr: nullable(v.potential_cr), selling_basic_price: nullable(v.selling_basic_price),
    bulk_and_barrel: nullable(v.bulk_and_barrel), remarks: v.remarks.trim(),
    cementitious_contents: v.cementitious_contents, requirement_type: v.requirement_type,
  }
  for (const f of FK_FIELDS) body[f] = fk(v[f])
  for (const f of M2M_FIELDS) body[f] = v[f]
  if (picksSalesPerson) body.sales_person = fk(v.sales_person)
  return body
}

/** Options for a lookup field, keeping a now inactive value the project already has. */
export function withCurrent(options: Lookup[] | undefined, current: Ref | Ref[] | null | undefined) {
  const opts = (options ?? []).map((o) => ({ id: o.id, value: o.value }))
  const cur = Array.isArray(current) ? current : current ? [current] : []
  const missing = cur.filter((c) => !opts.some((o) => o.id === c.id)).map((c) => ({ id: c.id, value: `${c.value} (inactive)` }))
  return [...opts, ...missing]
}
