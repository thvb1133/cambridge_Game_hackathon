// One camera for hands and eyes. A second getUserMedia call often fails
// once the first hold is granted, so both trackers share the stream and
// only the last one to stop actually releases it.

let pending = null;
let holders = 0;

export function acquireCamera() {
  holders += 1;
  if (!pending) {
    pending = navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .catch((error) => {
        pending = null;
        holders = Math.max(0, holders - 1);
        throw error;
      });
  }
  return pending;
}

export async function releaseCamera(video) {
  video?.pause?.();
  if (video) video.srcObject = null;
  holders = Math.max(0, holders - 1);
  if (holders > 0 || !pending) return;
  const stream = await pending.catch(() => null);
  pending = null;
  for (const track of stream?.getTracks?.() ?? []) track.stop();
}
