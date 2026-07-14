import { useWarehouseStore } from '../store/useWarehouseStore'
import { Rack } from './Rack'

export function Racks() {
  const racks = useWarehouseStore((s) => s.layout.racks)
  return (
    <>
      {Object.keys(racks).map((id) => (
        <Rack key={id} rackId={id} />
      ))}
    </>
  )
}
