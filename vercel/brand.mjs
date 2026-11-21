/* BlackGym's own name and icons, laid over the built openGym site (branding/README.md).
 *
 * Nothing in frontend/ knows the name or the pictures: this step runs after the build, on the
 * copy in .vercel/output/static, so openGym's sources stay openGym's.
 *
 *   brand/<id>-180.png, -320.png, -512.png   the icons (made by scripts/make-icons.py, committed)
 *   brand/manifest-<id>.json                 the web manifest with that icon
 *   brand/boot.js                            picks the icon chosen on this device (branding/boot.js)
 *   icon-180.png, icon-512.png, manifest.json  replaced with the default icon and the name, so a
 *                                            browser that runs no script still gets BlackGym
 *   index.html                               the name on the Home Screen, the icon on the loading
 *                                            screen instead of openGym's logo, and boot.js
 *   sw.js                                    its cache name follows these changes too
 *
 * Every edit of index.html is checked: if openGym changes the markup this relies on, the build
 * fails here and says what moved, rather than shipping a half-branded page.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function applyBrand({ brandDir, staticDir, log = console.log }) {
  const file = path.join(brandDir, 'brand.json');
  if (!fs.existsSync(file)) { log('no branding/brand.json: the site keeps openGym\'s name and icon'); return null; }
  const brand = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = brand.icons.map(i => i.id);
  if (!ids.includes(brand.default)) throw new Error(`brand.json: default "${brand.default}" is not one of ${ids.join(', ')}`);
  const out = path.join(staticDir, 'brand');
  fs.mkdirSync(out, { recursive: true });
  const read = p => fs.readFileSync(path.join(staticDir, p), 'utf8');
  const write = (p, text) => fs.writeFileSync(path.join(staticDir, p), text);
  const before = crypto.createHash('sha256').update(fs.readFileSync(path.join(staticDir, 'index.html'))).digest('hex').slice(0, 10);

  // the pictures
  for (const id of ids) for (const size of [180, 320, 512]) {
    const src = path.join(brandDir, 'web', `${id}-${size}.png`);
    if (!fs.existsSync(src)) throw new Error(`${path.relative(process.cwd(), src)} is missing: run python3 vercel/scripts/make-icons.py`);
    fs.copyFileSync(src, path.join(out, `${id}-${size}.png`));
  }
  fs.copyFileSync(path.join(out, `${brand.default}-180.png`), path.join(staticDir, 'icon-180.png'));
  fs.copyFileSync(path.join(out, `${brand.default}-512.png`), path.join(staticDir, 'icon-512.png'));

  // the manifests: the site's own with the name, and one per icon. Those sit in brand/, and a
  // manifest's addresses are read from where it is, hence the "../".
  const manifest = JSON.parse(read('manifest.json'));
  manifest.name = brand.name; manifest.short_name = brand.name;
  manifest.id = '/';   // one app whichever icon it wears
  write('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  for (const id of ids) {
    const m = { ...manifest, start_url: '../', scope: '../', icons: [
      { src: `${id}-180.png`, sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: `${id}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ] };
    fs.writeFileSync(path.join(out, `manifest-${id}.json`), JSON.stringify(m, null, 2) + '\n');
  }

  // the script, with the list in it. No file names of the drawings: the site has no use for them.
  const config = {
    name: brand.name, wordmark: brand.wordmark || null, tagline: brand.tagline || null, defaults: brand.defaults || null,
    default: brand.default, icons: brand.icons.map(({ id, name }) => ({ id, name })), hint: brand.hint || null,
  };
  const boot = fs.readFileSync(path.join(brandDir, 'boot.js'), 'utf8');
  if (!boot.includes('/*BRAND*/null/*END*/')) throw new Error('branding/boot.js lost its /*BRAND*/null/*END*/ marker');
  fs.writeFileSync(path.join(out, 'boot.js'), boot.replace('/*BRAND*/null/*END*/', JSON.stringify(config)));

  // index.html
  let html = read('index.html');
  const swap = (what, from, to) => {
    const next = html.replace(from, to);
    if (next === html) throw new Error(`brand: index.html has no ${what} to replace any more. openGym changed it: update vercel/brand.mjs`);
    html = next;
  };
  swap('<title>', /<title>[^<]*<\/title>/, `<title>${brand.name}</title>`);
  swap('apple-mobile-web-app-title', /(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${brand.name}$2`);
  swap('loading-screen logo', /<svg viewBox="80 140 352 250">[\s\S]*?<\/svg>/,
    `<img id="boot-icon" src="brand/${brand.default}-320.png" alt="" width="112" height="112" draggable="false">`);
  // After the loading screen's markup, so the picture is there to be pointed at. A script from this
  // site, which the Content-Security-Policy allows; the one inline script, pinned by its hash, is untouched.
  swap('loading screen', /(<div id="boot" aria-hidden="true">[\s\S]*?<\/div>)/, `$1\n<script src="brand/boot.js"></script>`);
  swap('loading-screen style', '<style>#boot{',
    '<style>#boot img{width:112px;height:112px;border-radius:25px;animation:1.6s ease-in-out infinite brand-breathe}' +
    '@keyframes brand-breathe{50%{opacity:.6;transform:scale(.97)}}' +
    '@media (prefers-reduced-motion:reduce){#boot img{animation:none}}#boot{');
  write('index.html', html);

  // sw.js names its cache after the build (a hash of index.html, frontend/vite.config.js). The
  // page just changed, so the name does too: a new icon set is a new cache, like a new build.
  const sw = read('sw.js');
  if (!sw.includes(before)) throw new Error('brand: sw.js does not carry the build stamp of index.html any more: update vercel/brand.mjs');
  const after = crypto.createHash('sha256').update(html).update(JSON.stringify(config)).update(boot).digest('hex').slice(0, 10);
  write('sw.js', sw.split(before).join(after));
  log(`brand: ${brand.name}, ${ids.length} icons, default ${brand.default}`);
  return config;
}
