// Fixed scenes for screenshots: a `?shot=` query asks main.js to build one deterministic
// scene through the api below, so the maker's screenshots always show the same covers.
//   ?shot=cover   the cover alone, filling the window (the exported art)
//   ?shot=editor  the editor with the samples loaded and a cover composed
// Recognised parameters: layout, grade, photo (lead sample), title, subtitle, badge,
// stars and size (the cover canvas size, e.g. size=1920x1080). window.__shotReady is
// set once the scene is painted and the fonts are in.

export async function runShot(query, api) {
  const shot = query.get('shot');
  if (shot === 'cover') document.body.classList.add('shot-cover');
  if (shot === 'editor') document.body.classList.add('shot-editor');
  await api.setup(query);
  if (document.fonts?.ready) await document.fonts.ready;
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
