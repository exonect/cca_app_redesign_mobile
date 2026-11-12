/**
 * Which role may open which screen, taken from what the server allows
 * (backend cca/core/permissions.py, cca/projects/workflow.py, cca/*\/api.py).
 * The server stays the judge; this only keeps people off screens the server
 * would refuse anyway, without firing the requests.
 *
 *   Screen (route)                     AD  SAD SP  CT   Server rule
 *   My work, Projects, Search, Alerts,
 *   More (tabs)                        y   y   y   y    lists filtered by visible_projects
 *   Project /project/[id]              y   y   y   y    visible_projects (record: 404)
 *   New project /project/new           y   y   y   -    ProjectViewSet.create refuses CT (403)
 *   Edit project /project/new?id=      y   y   y   -    workflow.can_edit: owner or manager on a
 *                                                       draft, Admin once created; never a CT
 *                                                       (record: actions.edit, else read only)
 *   Trials /trial, Trial /trial/[id]   y   y   y   y    visible_projects (record: 404; steps
 *                                                       editable only with actions.edit)
 *   Sieve data /sieve-data/[id]        y   y   y   y    visible_projects (record: 404; can_edit)
 *   Recipe master /recipes             y   -   -   y    legacy menus (server: SP sees none)
 *   Recipe /recipes/[id], new          y   y   -   y    RecipeViewSet: SP queryset none (404),
 *                                                       create AD (CT only from a trial's New
 *                                                       formulation), edit and delete AD only
 *   Users /admin/users                 y   -   -   -    UserViewSet IsAdmin
 *   Master data /admin/master-data     y   -   -   -    ReadAnyWriteAdmin (editing screen)
 *   Changes to sync /sync              y   y   y   y    this phone's own queue
 */
import type { Role } from '@/shared/types'

export const ROLES: readonly Role[] = ['AD', 'SAD', 'SP', 'CT']

export type ScreenKey =
  | 'home' | 'projects' | 'search' | 'alerts' | 'more'
  | 'project' | 'project-new' | 'project-edit'
  | 'trials' | 'trial' | 'sieve-data'
  | 'recipes' | 'recipe' | 'recipe-new'
  | 'users' | 'master-data' | 'sync'

const ALL = ROLES

export const ACCESS: Record<ScreenKey, readonly Role[]> = {
  home: ALL,
  projects: ALL,
  search: ALL,
  alerts: ALL,
  more: ALL,
  project: ALL,
  'project-new': ['AD', 'SAD', 'SP'],
  'project-edit': ['AD', 'SAD', 'SP'],
  trials: ALL,
  trial: ALL,
  'sieve-data': ALL,
  recipes: ['AD', 'CT'],
  recipe: ['AD', 'SAD', 'CT'],
  'recipe-new': ['AD', 'CT'],
  users: ['AD'],
  'master-data': ['AD'],
  sync: ALL,
}

/** Screen titles for the no access view. */
export const SCREEN_TITLE: Record<ScreenKey, string> = {
  home: 'My work', projects: 'Projects', search: 'Search', alerts: 'Alerts', more: 'More',
  project: 'Project', 'project-new': 'New project', 'project-edit': 'Edit project',
  trials: 'Trials', trial: 'Trial', 'sieve-data': 'Sieve data',
  recipes: 'Recipe master', recipe: 'Recipe', 'recipe-new': 'New recipe',
  users: 'Users', 'master-data': 'Master data', sync: 'Changes to sync',
}

export function canOpen(role: Role | null | undefined, screen: ScreenKey): boolean {
  return Boolean(role && ACCESS[screen].includes(role))
}
