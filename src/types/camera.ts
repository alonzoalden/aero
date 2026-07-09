export type CameraMode = 'free' | 'follow' | 'chase';

export type CameraFraming = 'center' | 'lookAhead' | 'lowerThird';

export type CameraSettings = {
  framing: CameraFraming;
};
