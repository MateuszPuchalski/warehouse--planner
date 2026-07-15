import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import { Floor } from './Floor'
import { Racks } from './Racks'
import { GhostRack } from './GhostRack'
import { AisleGuides } from './AisleGuides'
import { Walls } from './Walls'
import { WallGhost } from './WallGhost'

export function WarehouseCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [22, 18, 22], fov: 50, near: 0.1, far: 500 }}
    >
      <color attach="background" args={['#101216']} />
      <fog attach="fog" args={['#101216', 90, 220]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#b9c8e6', '#2c2a26', 0.35]} />
      <directionalLight
        castShadow
        position={[25, 45, 18]}
        intensity={1.5}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-camera-far={130}
        shadow-bias={-0.0003}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={3}
        maxDistance={140}
      />

      <Floor />
      <AisleGuides />
      <Walls />
      <Racks />
      <GhostRack />
      <WallGhost />

      {import.meta.env.DEV && <Stats />}
    </Canvas>
  )
}
