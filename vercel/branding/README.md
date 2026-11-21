# BlackGym's name and icons

openGym's sources know nothing of BlackGym. After the site is built, `vercel/brand.mjs` lays this
folder over it: the name on the Home Screen, the icon, and the picture on the loading screen.

| File | What it is |
|---|---|
| `brand.json` | The name and its wordmark (`wordmark`: the parts and their colours), the theme a new profile starts in (`defaults.theme`: `system`, `dark` or `light`), an optional line under the logo on the sign-in screen (`tagline`, per language), the icons, which one is the default, and the texts shown in Settings. |
| `BLACKGym_icon_*.png` | The drawings, 1024 × 1024. |
| `web/<id>-180.png`, `-320.png`, `-512.png` | The drawings as the site serves them, made by `scripts/make-icons.py`. Committed, so the build needs no image library. |
| `boot.js` | Runs before the app: applies the icon chosen on this device. |

| Icon | Drawing |
|---|---|
| `kettlebell` (the default) | `BLACKGym_icon_5.png` |
| `logo` | `BLACKGym_icon_1.png` |
| `dumbbell` | `BLACKGym_icon_2.png` |
| `back` | `BLACKGym_icon_3.png` |

## Where the choice is made

Settings → Look & Home → App icon. The choice is kept in the browser, per device, like the phone
app's icon. It changes the tab icon and the loading screen at once.

An icon already on an iPhone's Home Screen does not change: iOS takes the picture when the app is
added. Remove it from the Home Screen and add the app again to get the new one.

## Changing an icon, or adding one

1. Put the drawing here: a square PNG, 1024 × 1024.
2. Add it to `brand.json` (`id`: lowercase letters, digits and `-`; `name` in each language).
3. Make the web files and commit them:

```bash
python3 vercel/scripts/make-icons.py
```

The drawings have a rounded frame painted into them. A phone rounds an icon's corners itself, so
the script cuts that frame off. A drawing without a painted frame works as well.

The drawings are not part of openGym and not covered by its licences: they belong to the owner of
this deployment.
