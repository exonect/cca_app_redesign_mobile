import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { api, ApiError } from '@/api/client'
import type { Project } from '@/shared/types'

import { ProjectForm } from './ProjectFormScreen'
import { ProjectDetail } from './ProjectScreen'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockPreventRemove = jest.fn((_dirty: boolean, _cb?: unknown) => mockAllowLeave)
const mockAllowLeave = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true, navigate: jest.fn() },
  usePreventRemove: (dirty: boolean, cb?: unknown) => mockPreventRemove(dirty, cb),
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, full_name: 'Rahul Patil', role: 'SP', role_label: 'Sales Person', region_name: 'West' }, hasRole: (...r: string[]) => r.includes('SP') }),
}))
jest.mock('@/api/client', () => {
  class ApiError extends Error {
    status: number; code: string; fields: Record<string, string[]>
    constructor(status: number, code: string, message: string, fields: Record<string, string[]> = {}) {
      super(message); this.status = status; this.code = code; this.fields = fields
    }
  }
  return {
    ApiError,
    api: jest.fn(),
    fieldErrors: jest.requireActual('@/api/errors').fieldErrors,
  }
})
const mockApi = api as jest.MockedFunction<typeof api>

const clients: QueryClient[] = []
function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  clients.push(qc)
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}
afterEach(() => { clients.splice(0).forEach((c) => c.clear()) })

const lookups: Record<string, { id: number; value: string }[]> = { region: [{ id: 1, value: 'West' }] }

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', status: 'draft', status_label: 'Draft', project_name: 'Baner commercial podium', customer_name: 'Mula Concrete LLP', sfdc_no: '490233',
  region: { id: 1, value: 'West' }, city: { id: 2, value: 'Pune' }, sales_person: { id: 1, name: 'Rahul Patil' }, ct: null, trial_count: 0,
  potential_cr: '0.90', updated_at: '2026-11-03T10:00:00Z', contact_person_name: 'Prakash Kale', contact_email: 'p@x.in', contact_phone: '9822014763',
  selling_basic_price: null, bulk_and_barrel: null, remarks: '', cement_brands: [], cement_grades: [], mineral_admixtures: [], grades_of_concrete: [],
  wc_ratios_ssd: [], compressive_strengths: [], wc_ratio_corrected: null, cementitious_contents: [], requirement_type: '', retention_time: null,
  slump_flow: null, strength_age: null, sand_type: null, fine_aggregate_source: null, coarse_aggregate_source: null, sand_zone: null, admixture_base: null,
  created_at: '2026-11-01T10:00:00Z', created_by: null,
  actions: { edit: true, submit: true, request_support: false, assign_ct: false, start_trial: false, complete: false, reopen: false, delete: true },
  ...over,
})

/** A project with everything submit requires, as it is once past draft. */
const complete = (over: Partial<Project> = {}) => {
  const ref = (id: number, value: string) => ({ id, value })
  return project({
    selling_basic_price: '52.00', cement_brands: [ref(11, 'UltraTech')], cement_grades: [ref(12, 'OPC 53')], mineral_admixtures: [ref(13, 'Fly ash')],
    grades_of_concrete: [ref(14, 'M40')], wc_ratios_ssd: [ref(15, '0.38')], compressive_strengths: [ref(16, '48')], wc_ratio_corrected: ref(17, '0.40'),
    cementitious_contents: [420], requirement_type: 'slump', retention_time: ref(18, '2'), slump_flow: ref(19, '160'), strength_age: ref(20, '28 days'),
    sand_type: ref(21, 'Crushed'), fine_aggregate_source: ref(22, 'Local'), coarse_aggregate_source: ref(23, 'Local'), sand_zone: ref(24, 'Zone II'),
    ...over,
  })
}

beforeEach(() => {
  mockPush.mockReset(); mockReplace.mockReset(); mockApi.mockReset(); mockPreventRemove.mockClear(); mockAllowLeave.mockClear()
  mockApi.mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
    if (path === '/lookups/') return (lookups[String(opts?.query?.category)] ?? []) as never
    if (path.startsWith('/trials/') && opts?.query) return { count: 0, next: null, previous: null, results: [] } as never
    if (path.endsWith('/events/')) return [] as never
    throw new Error(`unexpected ${path}`)
  })
})

describe('project form', () => {
  it('blocks Create project without a price, then opens step 1 for a server error there', async () => {
    const p = project()
    const base = mockApi.getMockImplementation()!
    mockApi.mockImplementation(async (path: string, opts?: Parameters<typeof api>[1]) => {
      if (path === '/projects/p1/' && opts?.method === 'PATCH') return p as never
      if (path === '/projects/p1/submit/') throw new ApiError(400, 'invalid', 'Check the fields.', { sfdc_no: ['SFDC number is required to create the project.'] })
      return base(path, opts)
    })
    await render(wrap(<ProjectForm project={p} />))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Technical requirements')).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Enter a bulk or barrel basic selling price above zero.')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalledWith('/projects/p1/submit/', expect.anything())

    await fireEvent.changeText(screen.getByLabelText('Basic selling price, bulk, INR per kg'), '42')
    await fireEvent.press(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('SFDC number is required to create the project.')).toBeTruthy()
    expect(screen.getByText('Customer details')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

describe('project form errors and leaving', () => {
  it('maps a nested list error to its field and says errors on fields the form does not show', async () => {
    const p = project()
    const base = mockApi.getMockImplementation()!
    mockApi.mockImplementation(async (path: string, opts?: Parameters<typeof api>[1]) => {
      if (path === '/projects/p1/' && opts?.method === 'PATCH') {
        throw new ApiError(400, 'invalid', 'Some fields need attention.', {
          cementitious_contents: { 0: ['Ensure this value is less than or equal to 999.'] } as unknown as string[],
          created_by: ['This field is read only.'],
        })
      }
      return base(path, opts)
    })
    await render(wrap(<ProjectForm project={p} />))
    await fireEvent.press(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('This field is read only.')).toBeTruthy()
    expect(screen.getByText('Ensure this value is less than or equal to 999.')).toBeTruthy()
    expect(screen.getByText('Cementitious content')).toBeTruthy()
  })

  it('guards leaving only while there are unsaved changes, and lets a successful save through', async () => {
    const p = complete({ status: 'created', status_label: 'Created' })
    const base = mockApi.getMockImplementation()!
    mockApi.mockImplementation(async (path: string, opts?: Parameters<typeof api>[1]) => {
      if (path === '/projects/p1/' && opts?.method === 'PATCH') return { ...p, project_name: 'Baner podium, phase 2' } as never
      return base(path, opts)
    })
    await render(wrap(<ProjectForm project={p} />))
    expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(false)
    await fireEvent.changeText(screen.getByLabelText('Project name'), 'Baner podium, phase 2')
    expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(true)
    await fireEvent.press(screen.getAllByRole('button', { name: 'Save changes' })[0])
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/project/p1'))
    expect(mockAllowLeave).toHaveBeenCalled()
  })
})

describe('project form, final server rules', () => {
  it('adds a typed but not added cementitious value when saving a draft', async () => {
    const p = project()
    const base = mockApi.getMockImplementation()!
    mockApi.mockImplementation(async (path: string, opts?: Parameters<typeof api>[1]) => {
      if (path === '/projects/p1/' && opts?.method === 'PATCH') return { ...p, cementitious_contents: [420] } as never
      return base(path, opts)
    })
    await render(wrap(<ProjectForm project={p} />))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    await fireEvent.changeText(await screen.findByLabelText('Cementitious content to add, kg per cubic metre'), '420')
    expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(true)
    await fireEvent.press(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/projects/p1/', expect.objectContaining({
      method: 'PATCH', body: expect.objectContaining({ cementitious_contents: [420] }),
    })))
    expect(await screen.findByText('Draft saved')).toBeTruthy()
  })

  it('does not save a typed cementitious value that cannot be added', async () => {
    const p = project({ cementitious_contents: [420] })
    await render(wrap(<ProjectForm project={p} />))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    await fireEvent.changeText(await screen.findByLabelText('Cementitious content to add, kg per cubic metre'), '42')
    await fireEvent.press(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Enter a whole number from 100 to 999 kg/m³. Fix or clear the value you typed, then save again.')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalledWith('/projects/p1/', expect.anything())
  })

  it('past draft, will not save a required field left blank', async () => {
    const p = complete({ status: 'created', status_label: 'Created' })
    await render(wrap(<ProjectForm project={p} />))
    await fireEvent.changeText(screen.getByLabelText('Project name'), '  ')
    await fireEvent.press(screen.getAllByRole('button', { name: 'Save changes' })[0])
    expect(await screen.findByText('Project name is required once the project is created.')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalledWith('/projects/p1/', expect.anything())
  })
})

describe('project screen', () => {
  it('starts a trial and opens it', async () => {
    const p = project({ status: 'assigned_to_ct', status_label: 'Assigned to CT', actions: { ...project().actions, start_trial: true, delete: false, submit: false } })
    const base = mockApi.getMockImplementation()!
    mockApi.mockImplementation(async (path: string, opts?: Parameters<typeof api>[1]) => {
      if (path === '/trials/' && opts?.body) return { id: 't-new' } as never
      return base(path, opts)
    })
    await render(wrap(<ProjectDetail project={p} />))
    const start = await screen.findByRole('button', { name: 'Start trial 1' })
    await fireEvent.press(start)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/trial/t-new'))
    expect(mockApi).toHaveBeenCalledWith('/trials/', { body: { project: 'p1' } })
  })
})
