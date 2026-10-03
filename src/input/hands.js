// Webcam hand tracking. Deliberately classifies *static* hand shapes rather
// than traced sigil trajectories: finger-count classification is near-100%
// reliable under bad venue lighting, and a trajectory matcher that misfires
// on stage is worth less than no gesture input at all.
//
// Extended fingers → element. Pinch → release the spell.

import { ELEMENTS } from '../core/elements.js';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const FINGER_TIPS = [8, 12, 16, 20];
const FINGER_PIPS = [6, 10, 14, 18];

export class HandInput {
  constructor({ onElement = () => {}, onCast = () => {}, onStatus = () => {} } = {}) {
    this.onElement = onElement;
    this.onCast = onCast;
    this.onStatus = onStatus;
    this.enabled = false;
    this.landmarker = null;
    this.video = null;
    this.lastElement = null;
    this.pinchWasClosed = false;
    this.lastCastAt = 0;
  }

  async start() {
    this.onStatus('requesting camera…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.playsInline = true;
      this.video.muted = true;
      await this.video.play();
    } catch (error) {
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
      this.onStatus('hand model unavailable offline — keyboard and voice still work');
      return false;
    }

    this.enabled = true;
    this.onStatus('hands live · 1-5 fingers picks an element, pinch to cast');
    return true;
  }

  stop() {
    this.enabled = false;
    const tracks = this.video?.srcObject?.getTracks?.() ?? [];
    for (const track of tracks) track.stop();
  }

  poll(nowMs) {
    if (!this.enabled || !this.landmarker || this.video.readyState < 2) return null;

    const result = this.landmarker.detectForVideo(this.video, nowMs);
    const hand = result.landmarks?.[0];
    if (!hand) return null;

    const extended = countExtended(hand);
    if (extended >= 1 && extended <= 5) {
      const element = ELEMENTS[extended - 1];
      if (element !== this.lastElement) {
        this.lastElement = element;
        this.onElement(element);
      }
    }

    // Thumb tip to index tip, normalised against the hand's own span so it
    // works at any distance from the camera.
    const span = dist(hand[0], hand[9]) || 1;
    const pinch = dist(hand[4], hand[8]) / span;
    const closed = pinch < 0.45;
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
