// Thermax Sales Person on a trial (UAT, 11 Nov 2026): the project's creator, shown and never sent.
import { draftTrial } from '@/offline/overlay'

import { conclusionForm, conclusionPayload } from './forms'

const project = { created_by: { id: 1, name: 'Rita Dhage' }, sales_person: { id: 2, name: 'Other Person' } }
const trial = { remarks: '', signatory_sales: '', signatory_site_qc: ' QC ', signatory_rd: '', signature_sales: '', signature_site_qc: '', signature_rd: '' }

describe('Thermax Sales Person', () => {
  it('comes from the trial, else the project creator, else the Sales Person', () => {
    expect(conclusionForm(trial as never, project as never).signatory_sales).toBe('Rita Dhage')
    expect(conclusionForm({ ...trial, signatory_sales: 'Server Name' } as never, project as never).signatory_sales).toBe('Server Name')
    expect(conclusionForm(trial as never, { ...project, created_by: null } as never).signatory_sales).toBe('Other Person')
  })

  it('is never sent to the server', () => {
    const body = conclusionPayload({ ...conclusionForm(trial as never, project as never), signatory_sales: 'Typed' })
    expect(body).not.toHaveProperty('signatory_sales')
    expect(body.signatory_site_qc).toBe('QC')
  })

  it('is filled on a trial made offline', () => {
    const op = { kind: 'create_trial', trialId: 't1', project: 'p1', projectName: 'P', customerName: 'C', createdAt: '2026-11-11T10:00:00Z' }
    expect(draftTrial(op as never, { project_name: 'P', customer_name: 'C', ...project }).signatory_sales).toBe('Rita Dhage')
    expect(draftTrial(op as never).signatory_sales).toBe('')
  })
})
