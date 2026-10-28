/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LandmarkPoint, HandGesture } from '../types/motion';

function distance3D(p1: LandmarkPoint, p2: LandmarkPoint): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.hypot(dx, dy, dz);
}

/**
 * Recognizes hand gestures from landmarks using robust geometric distances.
 * Scale-invariant based on wrist-to-middle-knuckle palm size.
 */
export function recognizeHandGesture(landmarks: LandmarkPoint[]): HandGesture {
  if (!landmarks || landmarks.length < 21) {
    return 'UNKNOWN';
  }

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[2];
  const indexMcp = landmarks[5];
  const indexPip = landmarks[6];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const middlePip = landmarks[10];
  const middleTip = landmarks[12];
  const ringMcp = landmarks[13];
  const ringPip = landmarks[14];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyPip = landmarks[18];
  const pinkyTip = landmarks[20];

  // Palm reference scale (wrist to middle MCP)
  const palmScale = Math.max(distance3D(wrist, middleMcp), 0.05);

  // Finger extension checks (tip further from wrist than PIP joint)
  const isIndexExtended =
    distance3D(indexTip, wrist) > distance3D(indexPip, wrist) * 1.15 &&
    distance3D(indexTip, indexMcp) > palmScale * 0.55;

  const isMiddleExtended =
    distance3D(middleTip, wrist) > distance3D(middlePip, wrist) * 1.15 &&
    distance3D(middleTip, middleMcp) > palmScale * 0.55;

  const isRingExtended =
    distance3D(ringTip, wrist) > distance3D(ringPip, wrist) * 1.15 &&
    distance3D(ringTip, ringMcp) > palmScale * 0.55;

  const isPinkyExtended =
    distance3D(pinkyTip, wrist) > distance3D(pinkyPip, wrist) * 1.15 &&
    distance3D(pinkyTip, pinkyMcp) > palmScale * 0.55;

  // Thumb extension check
  const isThumbExtended =
    distance3D(thumbTip, pinkyMcp) > palmScale * 1.1 &&
    distance3D(thumbTip, thumbMcp) > palmScale * 0.5;

  const extendedCount =
    (isIndexExtended ? 1 : 0) +
    (isMiddleExtended ? 1 : 0) +
    (isRingExtended ? 1 : 0) +
    (isPinkyExtended ? 1 : 0);

  // 1. FIST DETECTION (curled fingers)
  // Fingers are curled toward palm if tips are close to their MCP or wrist
  if (extendedCount === 0) {
    return 'FIST';
  }

  // 2. OPEN PALM (all or 4 fingers extended)
  if (extendedCount >= 3 && (isIndexExtended && isMiddleExtended && isRingExtended)) {
    return 'OPEN_PALM';
  }

  // 3. THUMBS UP (thumb extended upward, other 4 fingers curled)
  if (extendedCount === 0 || (extendedCount === 1 && isIndexExtended === false)) {
    if (isThumbExtended && thumbTip.y < wrist.y - palmScale * 0.4) {
      return 'THUMBS_UP';
    }
  }

  // 4. PEACE / TWO FINGERS (index + middle extended, ring + pinky curled)
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return 'PEACE';
  }

  // 5. POINTING (only index finger extended)
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return 'POINTING';
  }

  // Loose fallback matching for dynamic motion
  if (extendedCount >= 3) {
    return 'OPEN_PALM';
  }
  if (extendedCount <= 1 && !isIndexExtended) {
    return 'FIST';
  }

  return 'UNKNOWN';
}
