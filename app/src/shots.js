// Screenshot scenes for the camera script (tools/shoot.mjs).
//
// A `?shot=` parameter picks the scene; the remaining parameters dress
// it. When the scene has been painted, window.__shotReady is set so
// the camera knows the frame is final.
//
//   ?shot=cover    just the cover, stretched over the whole viewport
//   ?shot=editor   the full studio with a scene loaded
//
// Dressing parameters: photo (pier | boulevard | both), caption,
// subtitle, layout, grade, size, and stars / badge / grain / vignette
// as 0 or 1.
export async function runShot(shot, query, api) {
  const { spec } = api;
  if (shot === 'cover') document.body.classList.add('shot-cover');

  if (query.get('caption')) spec.title = query.get('caption');
  if (query.get('subtitle')) spec.subtitle = query.get('subtitle');
  if (query.get('layout')) spec.layout = query.get('layout');
  if (query.get('grade')) spec.grade = query.get('grade');
  if (query.get('size')) spec.size = query.get('size');
  for (const flag of ['stars', 'badge', 'grain', 'vignette']) {
    if (query.has(flag)) spec[flag] = query.get(flag) !== '0';
  }

  const photo = query.get('photo') ?? 'pier';
  if (photo === 'both') {
    await api.loadSample('pier');
    await api.loadSample('boulevard');
  } else {
    await api.loadSample(photo);
  }
  api.distribute();
  api.finish();

  // Give webfont fallback metrics a moment to settle, then signal on
  // the second animation frame after document.fonts resolves.
  await document.fonts.ready;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
