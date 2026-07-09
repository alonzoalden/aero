import { writeFileSync } from 'node:fs';

const outputPath = new URL('../public/models/airplane.glb', import.meta.url);
const positions = [];
const normals = [];
const indices = [];

function pushVertex(position, normal) {
  positions.push(...position);
  normals.push(...normal);
  return positions.length / 3 - 1;
}

function addQuad(corners, normal) {
  const start = positions.length / 3;
  corners.forEach((corner) => pushVertex(corner, normal));
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function addBox(center, size) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size.map((value) => value / 2);
  const x0 = cx - sx;
  const x1 = cx + sx;
  const y0 = cy - sy;
  const y1 = cy + sy;
  const z0 = cz - sz;
  const z1 = cz + sz;

  addQuad(
    [
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1]
    ],
    [1, 0, 0]
  );
  addQuad(
    [
      [x0, y1, z0],
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1]
    ],
    [-1, 0, 0]
  );
  addQuad(
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    [0, 1, 0]
  );
  addQuad(
    [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y0, z1],
      [x1, y0, z1]
    ],
    [0, -1, 0]
  );
  addQuad(
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    [0, 0, 1]
  );
  addQuad(
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y0, z0],
      [x0, y0, z0]
    ],
    [0, 0, -1]
  );
}

function normalize(vector) {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

function addTriangle(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = normalize([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ]);
  const start = positions.length / 3;
  [a, b, c].forEach((point) => pushVertex(point, normal));
  indices.push(start, start + 1, start + 2);
}

function addNose() {
  const tip = [0, 3.45, 0.05];
  const topLeft = [-0.28, 2.35, 0.28];
  const topRight = [0.28, 2.35, 0.28];
  const bottomRight = [0.28, 2.35, -0.28];
  const bottomLeft = [-0.28, 2.35, -0.28];

  addTriangle(tip, topRight, topLeft);
  addTriangle(tip, bottomRight, topRight);
  addTriangle(tip, bottomLeft, bottomRight);
  addTriangle(tip, topLeft, bottomLeft);
  addQuad([topLeft, topRight, bottomRight, bottomLeft], [0, -1, 0]);
}

function addVerticalTail() {
  const leftBase = [-0.06, -2.75, 0.23];
  const rightBase = [0.06, -2.75, 0.23];
  const leftBack = [-0.06, -3.25, 0.23];
  const rightBack = [0.06, -3.25, 0.23];
  const leftTop = [-0.06, -3.15, 1.15];
  const rightTop = [0.06, -3.15, 1.15];

  addTriangle(leftBase, leftBack, leftTop);
  addTriangle(rightBase, rightTop, rightBack);
  addQuad([leftBase, rightBase, rightBack, leftBack], [0, 0, -1]);
  addQuad([leftBack, rightBack, rightTop, leftTop], [0, -1, 0]);
  addQuad([leftTop, rightTop, rightBase, leftBase], [0, 1, 0]);
}

// Local +Y is the airplane nose direction; FlightMap keeps a named yaw offset for future model swaps.
addBox([0, -0.2, 0], [0.5, 5.1, 0.48]);
addNose();
addBox([0, 0.1, 0.02], [5.1, 1.15, 0.08]);
addBox([0, -2.65, 0.12], [1.9, 0.62, 0.08]);
addVerticalTail();

const positionArray = new Float32Array(positions);
const normalArray = new Float32Array(normals);
const indexArray = new Uint16Array(indices);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];

for (let index = 0; index < positionArray.length; index += 3) {
  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], positionArray[index + axis]);
    max[axis] = Math.max(max[axis], positionArray[index + axis]);
  }
}

function toPaddedBuffer(typedArray) {
  const source = Buffer.from(typedArray.buffer);
  const padding = (4 - (source.length % 4)) % 4;
  return padding === 0 ? source : Buffer.concat([source, Buffer.alloc(padding)]);
}

function padJson(json) {
  const source = Buffer.from(JSON.stringify(json));
  const padding = (4 - (source.length % 4)) % 4;
  return padding === 0 ? source : Buffer.concat([source, Buffer.alloc(padding, 0x20)]);
}

const positionBuffer = toPaddedBuffer(positionArray);
const normalBuffer = toPaddedBuffer(normalArray);
const indexBuffer = toPaddedBuffer(indexArray);
const bufferLength = positionBuffer.length + normalBuffer.length + indexBuffer.length;
const json = {
  asset: {
    version: '2.0',
    generator: 'scripts/create-airplane-glb.mjs'
  },
  scenes: [{ nodes: [0] }],
  scene: 0,
  nodes: [{ mesh: 0, name: 'GeneratedAircraft' }],
  meshes: [
    {
      name: 'RecognizableLowPolyAircraft',
      primitives: [
        {
          attributes: {
            POSITION: 0,
            NORMAL: 1
          },
          indices: 2,
          material: 0,
          mode: 4
        }
      ]
    }
  ],
  materials: [
    {
      name: 'RepoGeneratedAircraftBlue',
      pbrMetallicRoughness: {
        baseColorFactor: [0.62, 0.86, 1, 1],
        metallicFactor: 0.05,
        roughnessFactor: 0.72
      }
    }
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: positionArray.length / 3,
      type: 'VEC3',
      min,
      max
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: normalArray.length / 3,
      type: 'VEC3'
    },
    {
      bufferView: 2,
      componentType: 5123,
      count: indexArray.length,
      type: 'SCALAR'
    }
  ],
  bufferViews: [
    {
      buffer: 0,
      byteOffset: 0,
      byteLength: positionArray.byteLength,
      target: 34962
    },
    {
      buffer: 0,
      byteOffset: positionBuffer.length,
      byteLength: normalArray.byteLength,
      target: 34962
    },
    {
      buffer: 0,
      byteOffset: positionBuffer.length + normalBuffer.length,
      byteLength: indexArray.byteLength,
      target: 34963
    }
  ],
  buffers: [{ byteLength: bufferLength }]
};

const jsonChunk = padJson(json);
const binaryChunk = Buffer.concat([positionBuffer, normalBuffer, indexBuffer]);
const glbLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(glbLength, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);

const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(binaryChunk.length, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);

writeFileSync(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]));
console.log(`Wrote ${outputPath.pathname}`);
console.log(`Vertices: ${positionArray.length / 3}`);
console.log(`Indices: ${indexArray.length}`);
console.log(`Triangles: ${indexArray.length / 3}`);
console.log(`Bounds: min ${min.join(', ')} max ${max.join(', ')}`);
