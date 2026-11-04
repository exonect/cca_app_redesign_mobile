import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { Project } from '@/shared/types'

import { refreshAfterRefusal, storeProject } from './api'
import { ConfirmSheet } from './Sheet'

/** "Mark completed" with its confirmation, from My work and the project screen. */
export function CompleteSheet({ project, open, onClose, onDone }: {
  project: { id: string; project_name: string; status?: string; trial_count?: number } | null; open: boolean; onClose: () => void; onDone?: (msg: string) => void
}) {
  const qc = useQueryClient()
  const complete = useMutation({
    mutationFn: (id: string) => api<Project>(`/projects/${id}/complete/`, { method: 'POST' }),
    onSuccess: (p) => { storeProject(qc, p); onDone?.('Project marked completed'); close() },
    onError: (e, id) => refreshAfterRefusal(qc, id, e),
  })
  const close = () => { complete.reset(); onClose() }
  return (
    <ConfirmSheet open={open} onClose={close} title="Mark this project completed?"
      body={`${project?.project_name || 'This project'} becomes read only and no more trials can be started on it. The Sales Person, the CT and the managers are notified. Only an Admin can reopen it.${
        project?.status === 'trial_in_progress' ? ' A trial is still open: it stays as it is and becomes read only with the project.'
          : project?.trial_count === 0 ? ' No trial has been run on this project.' : ''}`}
      confirmLabel="Mark completed" busy={complete.isPending} error={complete.error}
      onConfirm={() => project && complete.mutate(project.id)} />
  )
}
