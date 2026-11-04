import { AdminOnly } from '@/features/admin/AdminGate'
import { MasterDataScreen } from '@/features/admin/MasterDataScreen'

export default function MasterDataRoute() {
  return <AdminOnly title="Master data"><MasterDataScreen /></AdminOnly>
}
