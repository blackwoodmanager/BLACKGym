/* BlackGym's own icon, on this device.
 *
 * vercel/brand.mjs puts this file into the built site with the list from brand.json in place of
 * the null below, and loads it from index.html right after the loading screen's markup. It
 *   - points the home-screen icon, the tab icon and the web manifest at the icon chosen here,
 *   - shows that icon on the loading screen,
 *   - and hands the list to the app (window.__BLACKGYM_BRAND__), which offers the choice in
 *     Settings, Look & Home, App icon (frontend/src/lib/brand-icons.js).
 * The choice is kept in this browser only, like the phone app's icon: two devices can differ.
 * Plain old syntax, no modules: it runs before the app and must run where the app would not.
 */
(function () {
  var BRAND = /*BRAND*/null/*END*/;
  if (!BRAND || !BRAND.icons || !BRAND.icons.length) return;
  var KEY = 'blackgym_icon';
  var ids = [];
  for (var i = 0; i < BRAND.icons.length; i++) ids.push(BRAND.icons[i].id);

  function current() {
    try { var v = localStorage.getItem(KEY); if (ids.indexOf(v) >= 0) return v; } catch (e) { /* no storage */ }
    return BRAND['default'];
  }
  function href(selector, value) {
    var el = document.querySelector(selector);
    if (el && el.getAttribute('href') !== value) el.setAttribute('href', value);
  }
  function apply(id) {
    href('link[rel="apple-touch-icon"]', 'brand/' + id + '-180.png');
    href('link[rel="icon"]', 'brand/' + id + '-180.png');
    href('link[rel="manifest"]', 'brand/manifest-' + id + '.json');
    var img = document.getElementById('boot-icon');
    var src = 'brand/' + id + '-320.png';
    if (img && img.getAttribute('src') !== src) img.setAttribute('src', src);
  }
  window.__BLACKGYM_BRAND__ = {
    icons: BRAND.icons,
    hint: BRAND.hint || null,
    current: current,
    set: function (id) {
      if (ids.indexOf(id) < 0) throw new Error('unknown icon');
      try { localStorage.setItem(KEY, id); } catch (e) { /* this visit only */ }
      apply(id);
      return id;
    }
  };
  apply(current());
})();
