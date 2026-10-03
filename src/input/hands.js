// Webcam hand tracking. Deliberately classifies *static* hand shapes rather
// than traced sigil trajectories: finger-count classification is near-100%
// reliable under bad venue lighting, and a trajectory matcher that misfires
// on stage is worth less than no gesture input at all.
//
// Extended fingers → element. Pinch → release the spell.

import { ELEMENTS } from '../core/elements.js';
import { acquireCamera, releaseCamera } from './camera.js';

// Closed fist raises earth. One to five extended fingers attune, in wuxing
// order, and a pinch releases the bolt. Counted fingers survive bad light
// better than a drawn sigil.
export function gestureFromCount(extended) {
  if (extended <= 0) return { action: 'wall', element: 'earth' };
  if (extended > 5) return null;
  return { action: 'bind', element: ELEMENTS[extended - 1] };
}

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const FINGER_TIPS = [8, 12, 16, 20];
const FINGER_PIPS = [6, 10, 14, 18];

export class HandInput {
  constructor({ onElement = () => {}, onCast = () => {}, onWall = () => {}, onStatus = () => {} } = {}) {
    this.onElement = onElement;
    this.onCast = onCast;
    this.onWall = onWall;
    this.onStatus = onStatus;
    this.enabled = false;
    this.landmarker = null;
    this.video = null;
    this.lastElement = null;
    this.pinchWasClosed = false;
    this.fistHeld = false;
    this.lastCastAt = 0;
  }

  async start() {
    this.onStatus('requesting camera…');
    try {
      const stream = await acquireCamera();
      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.playsInline = true;
      this.video.muted = true;
      await this.video.play();
    } catch (error) {
      if (this.video) await releaseCamera(this.video);
      this.video = null;
      this.onStatus('camera denied — keyboard and voice still work');
      return false;
    }

    try {
      this.onStatus('loading hand model…');
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        numHands: 1,
        runningMode: 'VIDEO',
      });
    } catch (error) {
      await releaseCamera(this.video);
      this.video = null;
      this.onStatus('hand model unavailable offline — keyboard and voice still work');
      return false;
    }

    this.enabled = true;
    this.onStatus('hands live · fist raises earth, 1–5 fingers attune, pinch casts');
    return true;
  }

  stop() {
    this.enabled = false;
    const video = this.video;
    this.video = null;
    releaseCamera(video);
  }

  poll(nowMs) {
    if (!this.enabled || !this.landmarker || this.video.readyState < 2) return null;

    const result = this.landmarker.detectForVideo(this.video, nowMs);
    const hand = result.landmarks?.[0];
    if (!hand) {
      this.fistHeld = false;
      this.pinchWasClosed = false;
      return null;
    }

    const gesture = gestureFromCount(countExtended(hand));
    if (gesture?.action === 'bind' && gesture.element !== this.lastElement) {
      this.lastElement = gesture.element;
      this.onElement(gesture.element);
    }
    if (gesture?.action === 'wall' && !this.fistHeld && nowMs - this.lastCastAt > 500) {
      this.lastCastAt = nowMs;
      this.onWall();
    }
    this.fistHeld = gesture?.action === 'wall';

    // Thumb tip to index tip, normalised against the hand's own span so it
    // works at any distance from the camera. A closed fist is a wall, not a pinch.
    const span = dist(hand[0], hand[9]) || 1;
    const pinch = dist(hand[4], hand[8]) / span;
    const closed = gesture?.action !== 'wall' && pinch < 0.45;
    if (closed && !this.pinchWasClosed && nowMs - this.lastCastAt > 350) {
      this.lastCastAt = nowMs;
      this.onCast(this.lastElement);
    }
    this.pinchWasClosed = closed;

    // Palm centre in normalised screen space, used to draw the aim ring.
    return { x: 1 - hand[9].x, y: hand[9].y, element: this.lastElement };
  }
}

function countExtended(hand) {
  let count = 0;
  for (let i = 0; i < FINGER_TIPS.length; i += 1) {
    if (hand[FINGER_TIPS[i]].y < hand[FINGER_PIPS[i]].y) count += 1;
  }
  // Thumb opens sideways, so compare on x against the index knuckle.
  if (Math.abs(hand[4].x - hand[5].x) > 0.07) count += 1;
  return count;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}
