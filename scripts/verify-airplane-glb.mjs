import { readFileSync } from 'node:fs';

const modelPath = new URL('../public/models/airplane.glb', import.meta.url);
const bytes = readFileSync(modelPath);
const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readChunk(offset) {
  if (offset + 8 > bytes.byteLength) {
    fail(`Invalid GLB chunk header at byte ${offset}`);
  }

  const byteLength = dataView.getUint32(offset, true);
  const type = dataView.getUint32(offset + 4, true);
  const dataOffset = offset + 8;
  const nextOffset = dataOffset + byteLength;

  if (nextOffset > bytes.byteLength) {
    fail(`Invalid GLB chunk length ${byteLength} at byte ${offset}`);
  }

  return { byteLength, type, dataOffset, nextOffset };
}

if (bytes.byteLength < 20) {
  fail('GLB is too small to contain a valid header');
}

const magic = dataView.getUint32(0, true);
const version = dataView.getUint32(4, true);
const declaredLength = dataView.getUint32(8, true);

if (magic !== 0x46546c67) {
  fail(`Invalid magic 0x${magic.toString(16)}; expected 0x46546c67`);
}

if (version !== 2) {
  fail(`Unsupported GLB version ${version}; expected 2`);
}

if (declaredLength !== bytes.byteLength) {
  fail(`Length mismatch: header says ${declaredLength}, file has ${bytes.byteLength}`);
}

const jsonChunk = readChunk(12);

if (jsonChunk.type !== 0x4e4f534a) {
  fail('First GLB chunk is not JSON');
}

const jsonText = bytes.toString('utf8', jsonChunk.dataOffset, jsonChunk.nextOffset).trim();
const gltf = JSON.parse(jsonText);
const meshCount = Array.isArray(gltf.meshes) ? gltf.meshes.length : 0;
const primitiveCount = Array.isArray(gltf.meshes)
  ? gltf.meshes.reduce((count, mesh) => count + (Array.isArray(mesh.primitives) ? mesh.primitives.length : 0), 0)
  : 0;
let vertexCount = 0;
let indexCount = 0;
let triangleCount = 0;
const bounds = {
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity]
};

for (const mesh of gltf.meshes ?? []) {
  for (const primitive of mesh.primitives ?? []) {
    const positionAccessor = gltf.accessors?.[primitive.attributes?.POSITION];
    const indexAccessor = gltf.accessors?.[primitive.indices];

    if (!positionAccessor) {
      fail(`Mesh ${mesh.name ?? '(unnamed)'} has a primitive without POSITION data`);
    }

    vertexCount += positionAccessor.count ?? 0;

    if (Array.isArray(positionAccessor.min) && Array.isArray(positionAccessor.max)) {
      for (let axis = 0; axis < 3; axis += 1) {
        bounds.min[axis] = Math.min(bounds.min[axis], positionAccessor.min[axis]);
        bounds.max[axis] = Math.max(bounds.max[axis], positionAccessor.max[axis]);
      }
    }

    if (indexAccessor) {
      indexCount += indexAccessor.count ?? 0;
      triangleCount += Math.floor((indexAccessor.count ?? 0) / 3);
    } else {
      triangleCount += Math.floor((positionAccessor.count ?? 0) / 3);
    }
  }
}

if (meshCount === 0 || primitiveCount === 0 || vertexCount === 0 || triangleCount === 0) {
  fail('GLB has no mesh geometry');
}

console.log(`File: ${modelPath.pathname}`);
console.log(`Magic: glTF`);
console.log(`Version: ${version}`);
console.log(`Byte size: ${bytes.byteLength}`);
console.log(`Mesh count: ${meshCount}`);
console.log(`Primitive count: ${primitiveCount}`);
console.log(`Vertex count: ${vertexCount}`);
console.log(`Index count: ${indexCount}`);
console.log(`Triangle count: ${triangleCount}`);
console.log(`Bounds min: ${bounds.min.map((value) => value.toFixed(3)).join(', ')}`);
console.log(`Bounds max: ${bounds.max.map((value) => value.toFixed(3)).join(', ')}`);
