export type CameraMode = 'free' | 'follow' | 'chase';

export type CameraFraming = 'center' | 'lookAhead' | 'lowerThird';

export type OrbitSpeed = 'slow' | 'medium';

export type CameraSettings = {
  orbitEnabled: boolean;
  orbitSpeed: OrbitSpeed;
  framing: CameraFraming;
};
