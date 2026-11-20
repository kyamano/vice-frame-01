// Fixed scenes for screenshots, in the starter's spirit: a `?shot=` query
// names the scene, the other parameters dress it, and window.__shotReady
// flips once the scene is painted so the camera script knows when to fire.
//
//   ?shot=cover   the cover alone, filling the viewport
//   ?shot=editor  the whole studio with a scene loaded
//
// Parameters: photo (pier | boulevard | both), caption, subtitle, layout,
// grade, size, and the toggles stars / badge / grain / vignette as 0 or 1.
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

  // Fonts settle a beat after the images; two frames past document.fonts
  // is close enough that the camera never catches a half-painted title.
  await document.fonts.ready;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
