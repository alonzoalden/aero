import { writeFileSync } from 'node:fs';

const outputPath = new URL('../public/models/airplane.glb', import.meta.url);
const primitives = [];
let activePrimitive = null;

function createPrimitive(name, materialIndex) {
  return {
    name,
    materialIndex,
    positions: [],
    normals: [],
    indices: []
  };
}

function withPrimitive(name, materialIndex, build) {
  const previousPrimitive = activePrimitive;
  const primitive = createPrimitive(name, materialIndex);
  activePrimitive = primitive;
  build();
  primitives.push(primitive);
  activePrimitive = previousPrimitive;
}

function pushVertex(position, normal) {
  if (!activePrimitive) {
    throw new Error('No active primitive while building aircraft geometry.');
  }

  activePrimitive.positions.push(...position);
  activePrimitive.normals.push(...normal);
  return activePrimitive.positions.length / 3 - 1;
}

function addQuad(corners, normal) {
  if (!activePrimitive) {
    throw new Error('No active primitive while adding a quad.');
  }

  const start = activePrimitive.positions.length / 3;
  corners.forEach((corner) => pushVertex(corner, normal));
  activePrimitive.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
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
  if (!activePrimitive) {
    throw new Error('No active primitive while adding a triangle.');
  }

  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = normalize([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ]);
  const start = activePrimitive.positions.length / 3;
  [a, b, c].forEach((point) => pushVertex(point, normal));
  activePrimitive.indices.push(start, start + 1, start + 2);
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

const materials = [
  {
    name: 'WarmWhiteFuselage',
    pbrMetallicRoughness: {
      baseColorFactor: [0.92, 0.96, 1, 1],
      metallicFactor: 0.03,
      roughnessFactor: 0.46
    }
  },
  {
    name: 'AviationBlueTrim',
    pbrMetallicRoughness: {
      baseColorFactor: [0.04, 0.32, 0.72, 1],
      metallicFactor: 0.08,
      roughnessFactor: 0.38
    }
  },
  {
    name: 'SkyBlueHighlight',
    pbrMetallicRoughness: {
      baseColorFactor: [0.2, 0.72, 0.98, 1],
      metallicFactor: 0.04,
      roughnessFactor: 0.42
    }
  },
  {
    name: 'CharcoalCanopy',
    pbrMetallicRoughness: {
      baseColorFactor: [0.03, 0.08, 0.14, 1],
      metallicFactor: 0.02,
      roughnessFactor: 0.24
    }
  }
];

// Local +Y is the airplane nose direction; FlightMap keeps a named yaw offset for future model swaps.
withPrimitive('white-fuselage', 0, () => {
  addBox([0, -0.2, 0], [0.5, 5.1, 0.48]);
});
withPrimitive('blue-nose-and-tailplanes', 1, () => {
  addNose();
  addBox([0, -2.65, 0.12], [1.9, 0.62, 0.08]);
});
withPrimitive('blue-main-wing', 1, () => {
  addBox([0, 0.1, 0.02], [5.1, 1.15, 0.08]);
});
withPrimitive('white-wing-inlays', 0, () => {
  addBox([-1.35, 0.16, 0.08], [1.35, 0.46, 0.045]);
  addBox([1.35, 0.16, 0.08], [1.35, 0.46, 0.045]);
});
withPrimitive('sky-blue-fuselage-stripe', 2, () => {
  addBox([0, 0.18, 0.28], [0.22, 3.1, 0.055]);
  addBox([-0.285, -0.1, 0.04], [0.055, 3.55, 0.18]);
  addBox([0.285, -0.1, 0.04], [0.055, 3.55, 0.18]);
});
withPrimitive('dark-canopy', 3, () => {
  addBox([0, 1.65, 0.34], [0.38, 0.72, 0.11]);
});
withPrimitive('blue-vertical-tail', 1, () => {
  addVerticalTail();
});

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

const bufferViews = [];
const accessors = [];
const meshPrimitives = [];
const binaryParts = [];
let byteOffset = 0;
let totalVertexCount = 0;
let totalIndexCount = 0;
const bounds = {
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity]
};

function pushBufferView(typedArray, target) {
  const paddedBuffer = toPaddedBuffer(typedArray);
  const bufferViewIndex = bufferViews.length;
  bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: typedArray.byteLength,
    target
  });
  binaryParts.push(paddedBuffer);
  byteOffset += paddedBuffer.length;

  return bufferViewIndex;
}

for (const primitive of primitives) {
  const positionArray = new Float32Array(primitive.positions);
  const normalArray = new Float32Array(primitive.normals);
  const indexArray = new Uint16Array(primitive.indices);
  const primitiveMin = [Infinity, Infinity, Infinity];
  const primitiveMax = [-Infinity, -Infinity, -Infinity];

  for (let index = 0; index < positionArray.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      primitiveMin[axis] = Math.min(primitiveMin[axis], positionArray[index + axis]);
      primitiveMax[axis] = Math.max(primitiveMax[axis], positionArray[index + axis]);
      bounds.min[axis] = Math.min(bounds.min[axis], positionArray[index + axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], positionArray[index + axis]);
    }
  }

  const positionBufferView = pushBufferView(positionArray, 34962);
  const normalBufferView = pushBufferView(normalArray, 34962);
  const indexBufferView = pushBufferView(indexArray, 34963);
  const positionAccessor = accessors.length;
  accessors.push({
    bufferView: positionBufferView,
    componentType: 5126,
    count: positionArray.length / 3,
    type: 'VEC3',
    min: primitiveMin,
    max: primitiveMax
  });

  const normalAccessor = accessors.length;
  accessors.push({
    bufferView: normalBufferView,
    componentType: 5126,
    count: normalArray.length / 3,
    type: 'VEC3'
  });

  const indexAccessor = accessors.length;
  accessors.push({
    bufferView: indexBufferView,
    componentType: 5123,
    count: indexArray.length,
    type: 'SCALAR'
  });

  meshPrimitives.push({
    attributes: {
      POSITION: positionAccessor,
      NORMAL: normalAccessor
    },
    indices: indexAccessor,
    material: primitive.materialIndex,
    mode: 4
  });

  totalVertexCount += positionArray.length / 3;
  totalIndexCount += indexArray.length;
}

const binaryChunk = Buffer.concat(binaryParts);
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
      primitives: meshPrimitives
    }
  ],
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: binaryChunk.length }]
};

const jsonChunk = padJson(json);
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
console.log(`Primitives: ${primitives.length}`);
console.log(`Vertices: ${totalVertexCount}`);
console.log(`Indices: ${totalIndexCount}`);
console.log(`Triangles: ${totalIndexCount / 3}`);
console.log(`Bounds: min ${bounds.min.join(', ')} max ${bounds.max.join(', ')}`);
