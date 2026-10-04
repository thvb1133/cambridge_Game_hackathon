// Webcam iris aim. Looking near an enemy selects it; the hand or the voice
// still decides what is cast. If the face model cannot load, the match
// keeps working from the keyboard.

import { aimFromIrises } from './aim.js';
import { acquireCamera, releaseCamera } from './camera.js';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

export class GazeInput {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.enabled = false;
    this.landmarker = null;
    this.video = null;
  }

  async start() {
    this.onStatus('requesting camera for gaze…');
    try {
      const stream = await acquireCamera();
      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.playsInline = true;
      this.video.muted = true;
      await this.video.play();
    } catch {
      if (this.video) await releaseCamera(this.video);
      this.video = null;
      this.onStatus('camera denied — keyboard and voice still aim by words');
      return false;
    }

    try {
      this.onStatus('loading gaze model…');
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      this.landmarker = await createLandmarker(vision, fileset);
    } catch {
      await releaseCamera(this.video);
      this.video = null;
      this.onStatus('gaze model unavailable offline — keyboard and voice still work');
      return false;
    }

    this.enabled = true;
    this.onStatus('eyes live · look at a fighter to choose it');
    return true;
  }

  stop() {
    this.enabled = false;
    const video = this.video;
    this.video = null;
    releaseCamera(video);
  }

  poll(nowMs) {
    if (!this.enabled || !this.landmarker || this.video?.readyState < 2) return null;
    const result = this.landmarker.detectForVideo(this.video, nowMs);
    const face = result.faceLandmarks?.[0];
    if (!face || face.length <= RIGHT_IRIS) return null;
    return aimFromIrises(face[LEFT_IRIS], face[RIGHT_IRIS]);
  }
}

async function createLandmarker(vision, fileset) {
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
  });
  try {
    return await vision.FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    return vision.FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
}
