import * as THREE from 'three'

// Shared geometry/materials — created once at module scope, never per render.

export const boxGeo = new THREE.BoxGeometry(1, 1, 1)

export const uprightMat = new THREE.MeshStandardMaterial({
  color: '#2f6fb8',
  roughness: 0.55,
  metalness: 0.3,
})

export const beamMat = new THREE.MeshStandardMaterial({
  color: '#e8792b',
  roughness: 0.5,
  metalness: 0.25,
})

export const deckMat = new THREE.MeshStandardMaterial({
  color: '#7a808c',
  roughness: 0.85,
  metalness: 0.05,
})

export const ghostValidMat = new THREE.MeshStandardMaterial({
  color: '#3ddc84',
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  roughness: 0.6,
})

export const ghostInvalidMat = new THREE.MeshStandardMaterial({
  color: '#ff5c5c',
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  roughness: 0.6,
})

export const slotMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  roughness: 0.9,
  metalness: 0,
})

export const wallMat = new THREE.MeshStandardMaterial({
  color: '#5b6472',
  roughness: 0.92,
  metalness: 0.02,
})

export const wallGhostValidMat = new THREE.MeshStandardMaterial({
  color: '#4c9aff',
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  roughness: 0.7,
})

export const wallGhostInvalidMat = new THREE.MeshStandardMaterial({
  color: '#ff5c5c',
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  roughness: 0.7,
})
