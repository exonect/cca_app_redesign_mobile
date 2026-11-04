/** Map a notification link (web paths) to an app route.
 * /projects/<id> -> /project/<id>; /projects/<id>/trials/<tid> -> /trial/<tid>. */
export function appRoute(link: string | null | undefined, trialId?: string | null): string | null {
  const path = (link ?? '').split(/[?#]/)[0].replace(/\/+$/, '')
  const trial = path.match(/^\/projects\/[^/]+\/trials\/([^/]+)$/) ?? path.match(/^\/trials\/([^/]+)$/)
  if (trial) return `/trial/${trial[1]}`
  const project = path.match(/^\/projects\/([^/]+)$/)
  if (project && project[1] !== 'new') return `/project/${project[1]}`
  if (trialId) return `/trial/${trialId}`
  return null
}
