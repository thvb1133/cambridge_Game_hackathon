// Normalised camera space (0–1, origin top-left, already mirrored) onto the
// arena floor. Shared by the hand palm and the iris so both aim the same way.

export function screenToArena({ x, y }) {
  return { x: (x - 0.5) * 24, z: (y - 0.5) * 22 + 2 };
}

// Iris centres from the MediaPipe face mesh. x is mirrored because the
// preview the player sees is a mirror.
export function aimFromIrises(left, right) {
  if (!left || !right) return null;
  if (![left.x, left.y, right.x, right.y].every(Number.isFinite)) return null;
  return {
    x: 1 - (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}
