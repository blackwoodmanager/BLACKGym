// The openGym logo, as in assets/logo: the mark (five plain rectangles on a 352×174 grid, square
// corners, brand green) and the lockup (mark, then "open" plus "Gym" in brand green). Brand colours,
// not the accent: the accent is the user's, the logo is not. Never mirrored in RTL.
//
// A deployment with a name and icon of its own (lib/brand.js) shows those here instead.
import { brandLockup } from '../lib/brand.js'

const RECTS = [[80, 242, 352, 28], [80, 199, 36, 114], [131, 169, 47, 174], [334, 169, 47, 174], [396, 199, 36, 114]]

/** The mark alone, `height` px high (width follows, 352:174). `color` only for a one-colour use. */
export function BrandMark({ height = 24, color = '#a3e635', className, style }) {
  const own = brandLockup()
  if (own?.src) {
    const px = Math.round(height * 1.6)
    return <img className={className} src={own.src} alt="" width={px} height={px} draggable="false"
      style={{ flex: 'none', borderRadius: '23%', ...style }} />
  }
  return (
    <svg className={className} viewBox="80 169 352 174" width={height * 352 / 174} height={height}
      fill={color} aria-hidden="true" focusable="false" style={{ flex: 'none', ...style }}>
      {RECTS.map(([x, y, w, h]) => <rect key={x + '-' + y} x={x} y={y} width={w} height={h} />)}
    </svg>
  )
}

/**
 * The lockup at `size` px type: mark 1.07× the type high, a gap of 0.2×, the mark's middle at
 * 0.36× above the baseline (opengym-logo-dark.svg). "open" follows the theme (index.css .brand-lockup).
 */
export default function BrandLogo({ size = 34, as: Tag = 'span', className = '', style }) {
  const own = brandLockup()
  if (own) return (
    <Tag className={('brand-lockup ' + className).trim()} dir="ltr" aria-label={own.name}
      style={{ fontSize: size, display: 'inline-flex', alignItems: 'center', gap: '.32em', letterSpacing: '.06em', fontWeight: 800, ...style }}>
      {own.src && <img src={own.src} alt="" width={Math.round(size * 1.5)} height={Math.round(size * 1.5)} draggable="false" style={{ borderRadius: '23%' }} />}
      <span aria-hidden="true">
        {own.parts.map(([text, colour], i) => colour
          ? <span key={i} style={{ color: colour }}>{text}</span>
          : <span key={i} className="brand-lockup-open">{text}</span>)}
      </span>
    </Tag>
  )
  return (
    <Tag className={('brand-lockup ' + className).trim()} dir="ltr" style={{ fontSize: size, ...style }}>
      <svg className="brand-lockup-mark" viewBox="80 169 352 174" aria-hidden="true" focusable="false">
        {RECTS.map(([x, y, w, h]) => <rect key={x + '-' + y} x={x} y={y} width={w} height={h} />)}
      </svg>
      <span className="brand-lockup-open">open</span><span className="brand-lockup-gym">Gym</span>
    </Tag>
  )
}
