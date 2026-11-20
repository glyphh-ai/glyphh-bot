import { useId } from 'react'
import type { Look } from '../../shared/types'

/** Lighten (amt > 0) or darken (amt < 0) a hex color. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number): number => {
    const t = amt < 0 ? 0 : 255
    return Math.round(v + (t - v) * Math.abs(amt))
  }
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}

const INK = '#0a0514'
const STEEL = '#d7dcea'
const MIRROR = 'translate(200 0) scale(-1 1)'

interface Props {
  look: Look
  size?: number
  /** 'head' crops to the face for the rail; 'full' shows the whole fit. */
  mode?: 'head' | 'full'
  speaking?: boolean
  className?: string
}

/**
 * The Oliver horse. Every bot is this one character, drawn sharp: angular
 * head, half-shut eyes, a smirk, pierced ears. The look decides the coat, the
 * mane, the fit and the extras.
 */
export function Horse({ look, size = 48, mode = 'head', speaking, className }: Props): JSX.Element {
  const uid = useId().replace(/:/g, '')
  const L = look
  const coatDark = shade(L.coat, -0.38)
  const coatLight = shade(L.coat, 0.26)
  const maneDark = shade(L.mane, -0.35)
  const topDark = shade(L.topColor, -0.4)
  const topLight = shade(L.topColor, 0.2)
  const jeansDark = shade(L.jeansColor, -0.4)
  const jeansLight = shade(L.jeansColor, 0.25)
  const shortSleeve = L.top === 'tee' || L.top === 'crop' || L.top === 'jersey'
  const hat = L.accessory === 'beanie' || L.accessory === 'cap'
  const topFill = L.top === 'flannel' ? `url(#plaid${uid})` : L.topColor
  const hem = L.top === 'crop' ? 168 : 194
  const full = mode === 'full'

  const ears = (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M81 42 L64 2 L94 30 Z" fill={L.coat} />
      <path d="M119 42 L136 2 L106 30 Z" fill={L.coat} />
      <path d="M80 34 L70 12 L88 29 Z" fill={coatDark} stroke="none" />
      <path d="M120 34 L130 12 L112 29 Z" fill={coatDark} stroke="none" />
      {/* a notch and the piercings */}
      <path d="M131 14 L127 18 L133 20 Z" fill={INK} stroke="none" />
      <circle cx="68" cy="16" r="3" fill="none" stroke={STEEL} strokeWidth="2" />
      <circle cx="71" cy="24" r="3" fill="none" stroke={L.accent} strokeWidth="2" />
      <circle cx="129" cy="26" r="1.8" fill={STEEL} stroke="none" />
    </g>
  )

  const eye = (
    <g>
      <path d="M72 66 L80 57 L94 60 L96 69 L86 74 L75 72 Z" fill="#ffffff" />
      <circle cx="86" cy="67" r="5.6" fill={L.accent} stroke="none" />
      <circle cx="86" cy="67" r="2.6" fill={INK} stroke="none" />
      <circle cx="88.4" cy="64.6" r="1.5" fill="#ffffff" stroke="none" />
      {/* the heavy lid: unbothered */}
      <path d="M70 65 L80 55 L96 59 L96 64 L81 61 L72 68 Z" fill={coatDark} />
      {L.lashes && <path d="M73 67 L63 60 L72 62" fill={INK} strokeWidth="1.6" />}
    </g>
  )

  return (
    <svg
      className={className}
      width={size}
      height={full ? size * 1.4 : size}
      viewBox={full ? '0 0 200 280' : '36 -4 128 128'}
      style={{
        overflow: 'visible',
        filter: `drop-shadow(0 0 ${Math.max(1.5, size * 0.02)}px ${L.accent}cc)`
      }}
    >
      <defs>
        <pattern id={`plaid${uid}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill={L.topColor} />
          <rect width="14" height="4" y="5" fill={topDark} opacity="0.8" />
          <rect width="4" height="14" x="5" fill={topDark} opacity="0.8" />
          <rect width="14" height="1" y="1" fill={topLight} opacity="0.6" />
          <rect width="1" height="14" x="1" fill={topLight} opacity="0.6" />
        </pattern>
        <linearGradient id={`lens${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.25" stopColor={L.accent} />
          <stop offset="1" stopColor="#12081f" />
        </linearGradient>
      </defs>

      {full && (
        <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
          {/* tail, cut in shards */}
          <path d="M132 184 L170 172 L164 196 L180 204 L166 222 L174 240 L156 252 L158 226 L146 212 L150 198 Z" fill={L.mane} />
          <path d="M164 196 L180 204 L166 222 Z" fill={L.accent} />

          {/* legs under shorts or a skirt */}
          {(L.jeans === 'shorts' || L.jeans === 'skirt') && (
            <>
              <path d="M70 206 L92 206 L90 248 L66 248 Z" fill={L.coat} />
              <path d="M108 206 L130 206 L134 248 L110 248 Z" fill={L.coat} />
              <path d="M67 232 L91 232 M109 232 L133 232" stroke={L.accent} strokeWidth="4" />
            </>
          )}

          {/* jeans */}
          {L.jeans === 'baggy' && (
            <>
              <path d="M63 186 L100 186 L97 250 L50 250 Z" fill={L.jeansColor} />
              <path d="M100 186 L137 186 L150 250 L103 250 Z" fill={L.jeansColor} />
              <path d="M56 232 L72 240 L96 234 M104 234 L128 240 L146 232" fill="none" stroke={jeansDark} />
              <path d="M70 196 L66 246 M130 196 L136 246" fill="none" stroke={jeansLight} strokeDasharray="3 3" strokeWidth="1.4" />
            </>
          )}
          {(L.jeans === 'skinny' || L.jeans === 'ripped') && (
            <>
              <path d="M65 186 L100 186 L93 250 L68 250 Z" fill={L.jeansColor} />
              <path d="M100 186 L135 186 L132 250 L107 250 Z" fill={L.jeansColor} />
            </>
          )}
          {L.jeans === 'ripped' && (
            <g>
              <path d="M70 212 L93 208 L92 220 L70 224 Z" fill={L.coat} stroke="none" />
              <path d="M108 224 L131 220 L131 232 L109 236 Z" fill={L.coat} stroke="none" />
              <path d="M70 212 L93 208 M70 218 L92 214 M70 224 L92 220 M108 224 L131 220 M108 230 L131 226 M109 236 L131 232" stroke="#ffffff" strokeWidth="1.1" opacity="0.85" />
              <path d="M72 238 L86 236 M112 206 L126 204" stroke={jeansLight} strokeWidth="1.4" />
            </g>
          )}
          {L.jeans === 'shorts' && (
            <>
              <path d="M64 186 L100 186 L98 214 L62 216 Z" fill={L.jeansColor} />
              <path d="M100 186 L136 186 L138 216 L102 214 Z" fill={L.jeansColor} />
              <path d="M62 216 L66 220 L70 215 L75 220 L80 214 L86 219 L91 214 L98 218 M102 218 L108 214 L114 219 L120 214 L126 220 L131 215 L138 220" fill="none" stroke={jeansLight} strokeWidth="1.4" />
            </>
          )}
          {L.jeans === 'skirt' && (
            <>
              <path d="M64 186 L136 186 L150 222 L132 218 L116 224 L100 218 L84 224 L68 218 L50 222 Z" fill={L.jeansColor} />
              <path d="M82 190 L78 218 M100 190 L100 216 M118 190 L122 218" stroke={jeansDark} fill="none" />
            </>
          )}

          {/* studded belt and the wallet chain */}
          <path d="M63 185 L137 185 L137 194 L63 194 Z" fill={INK} />
          {[70, 80, 90, 110, 120, 130].map((x) => (
            <path key={x} d={`M${x} 187 l3 2.5 l-3 2.5 l-3 -2.5 z`} fill={STEEL} stroke="none" />
          ))}
          <rect x="95" y="185" width="10" height="9" fill={L.accent} />
          <path d="M112 194 Q118 222 138 198" fill="none" stroke={INK} strokeWidth="5" />
          <path d="M112 194 Q118 222 138 198" fill="none" stroke={STEEL} strokeWidth="2.4" strokeDasharray="4 2.5" />

          {/* chunky sneakers */}
          {[73, 127].map((cx) => (
            <g key={cx}>
              <path d={`M${cx - 23} 256 L${cx - 20} 242 L${cx - 8} 238 L${cx + 8} 238 L${cx + 20} 242 L${cx + 23} 256 Z`} fill={L.sneakers} />
              <path d={`M${cx - 9} 239 L${cx} 250 L${cx + 9} 239 Z`} fill={shade(L.sneakers, -0.3)} stroke="none" />
              <path d={`M${cx - 6} 244 L${cx + 6} 244 M${cx - 4} 248 L${cx + 4} 248`} stroke={L.accent} strokeWidth="2.2" strokeLinecap="round" />
              <path d={`M${cx - 26} 255 L${cx + 26} 255 L${cx + 27} 268 L${cx - 27} 268 Z`} fill="#ffffff" />
              <path d={`M${cx - 26} 261 L${cx + 26} 261`} stroke={L.accent} strokeWidth="2.6" />
              <path d={`M${cx - 18} 268 L${cx - 18} 263 M${cx - 9} 268 L${cx - 9} 263 M${cx} 268 L${cx} 263 M${cx + 9} 268 L${cx + 9} 263 M${cx + 18} 268 L${cx + 18} 263`} strokeWidth="1.2" />
            </g>
          ))}

          {/* belly, when the top is cropped */}
          {L.top === 'crop' && <path d="M65 162 L135 162 L136 187 L64 187 Z" fill={L.coat} />}

          {/* arms */}
          {shortSleeve ? (
            <>
              <path d="M56 152 L44 196 L60 200 L70 158 Z" fill={L.coat} />
              <path d="M144 152 L156 196 L140 200 L130 158 Z" fill={L.coat} />
              <path d="M68 138 L50 146 L48 170 L68 172 Z" fill={topFill} />
              <path d="M132 138 L150 146 L152 170 L132 172 Z" fill={topFill} />
            </>
          ) : (
            <>
              <path d="M68 138 L48 148 L42 196 L61 200 L68 170 Z" fill={topFill} />
              <path d="M132 138 L152 148 L158 196 L139 200 L132 170 Z" fill={topFill} />
            </>
          )}
          {/* wristbands and hooves */}
          <path d="M42 190 L61 194 L60 200 L41 196 Z" fill={L.accent} />
          <path d="M158 190 L139 194 L140 200 L159 196 Z" fill={INK} />
          <path d="M41 197 L39 210 L52 213 L60 201 Z" fill={coatDark} />
          <path d="M159 197 L161 210 L148 213 L140 201 Z" fill={coatDark} />

          {/* hood, behind the neck */}
          {L.top === 'hoodie' && <path d="M66 144 L72 118 L100 112 L128 118 L134 144 Z" fill={topDark} />}

          {/* neck */}
          <path d="M86 104 L114 104 L120 146 L80 146 Z" fill={L.coat} />
          <path d="M100 104 L114 104 L120 146 L100 146 Z" fill={coatDark} opacity="0.3" stroke="none" />

          {/* the top, cut oversized */}
          <path d={`M66 140 L86 132 L100 146 L114 132 L134 140 L140 ${hem} L60 ${hem} Z`} fill={topFill} />
          <path d={`M100 146 L114 132 L134 140 L140 ${hem} L100 ${hem} Z`} fill={INK} opacity="0.16" stroke="none" />

          {L.top === 'hoodie' && (
            <>
              <path d="M78 172 L122 172 L128 192 L72 192 Z" fill={topDark} opacity="0.7" stroke="none" />
              <path d="M92 142 L88 166 M108 142 L112 166" stroke={L.accent} strokeWidth="2.6" strokeLinecap="round" fill="none" />
              <path d="M90 150 L110 168 M110 150 L90 168" stroke={L.accent} strokeWidth="5" strokeLinecap="square" fill="none" />
            </>
          )}
          {L.top === 'tee' && (
            <path d="M106 148 L88 172 L99 172 L93 190 L114 164 L103 164 Z" fill={L.accent} strokeWidth="1.6" />
          )}
          {L.top === 'crop' && (
            <path d="M100 142 l3.5 7 7.5 1 -5.5 5.5 1.5 7.5 -7 -3.6 -7 3.6 1.500 -7.500 -5.500 -5.500 7.500 -1 z" fill={L.accent} strokeWidth="1.6" />
          )}
          {L.top === 'jersey' && (
            <>
              <text x="100" y="182" textAnchor="middle" fontSize="30" fontWeight="900" fontStyle="italic" fontFamily="'Avenir Next Condensed', Impact, system-ui" fill={L.accent} stroke={INK} strokeWidth="1.4">13</text>
              <path d="M49 158 L68 161 M49 164 L68 167 M151 158 L132 161 M151 164 L132 167" stroke={L.accent} strokeWidth="2.6" />
            </>
          )}
          {L.top === 'flannel' && (
            <>
              <path d={`M88 134 L100 146 L112 134 L116 ${hem} L84 ${hem} Z`} fill={INK} />
              <path d="M104 156 L94 172 L101 172 L97 184 L108 168 L102 168 Z" fill={L.accent} stroke="none" />
            </>
          )}
          {L.top === 'bomber' && (
            <>
              <path d={`M61 ${hem - 10} L139 ${hem - 10} L140 ${hem} L60 ${hem} Z`} fill={INK} />
              <path d={`M100 146 L100 ${hem - 10}`} stroke={STEEL} strokeWidth="2.4" strokeDasharray="2 2" fill="none" />
              <path d="M84 133 L100 150 L116 133 L112 128 L100 142 L88 128 Z" fill={INK} />
              <path d="M47 160 L67 163 M153 160 L133 163" stroke={L.accent} strokeWidth="5" />
              <rect x="110" y="154" width="16" height="11" fill={L.accent} transform="rotate(-8 118 160)" />
            </>
          )}
          {L.accessory === 'chain' && (
            <>
              <path d="M84 138 Q100 170 116 138" fill="none" stroke={INK} strokeWidth="6" />
              <path d="M84 138 Q100 170 116 138" fill="none" stroke={STEEL} strokeWidth="3" strokeDasharray="5 2.5" />
              <path d="M100 152 l6 8 -6 8 -6 -8 z" fill={L.accent} />
            </>
          )}
          {L.accessory === 'choker' && (
            <>
              <path d="M83 122 L117 122 L118 131 L82 131 Z" fill={INK} />
              {[88, 96, 104, 112].map((x) => (
                <path key={x} d={`M${x - 3} 131 L${x} 139 L${x + 3} 131 Z`} fill={STEEL} strokeWidth="1.2" />
              ))}
            </>
          )}
        </g>
      )}

      {/* mane behind the head */}
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        {L.maneStyle === 'long' &&
          [undefined, MIRROR].map((t, i) => (
            <g key={i} transform={t}>
              <path d="M78 34 L52 58 L60 82 L44 104 L58 124 L46 152 L74 138 L70 100 L80 60 Z" fill={L.mane} />
              <path d="M58 124 L46 152 L74 138 Z" fill={i ? L.accent : maneDark} />
            </g>
          ))}
        {L.maneStyle === 'swoosh' && (
          <path d="M118 34 L146 52 L138 72 L150 92 L132 110 L130 84 L122 60 Z" fill={L.mane} />
        )}
        {L.maneStyle === 'braids' &&
          [undefined, MIRROR].map((t, i) => (
            <g key={i} transform={t}>
              {[56, 72, 88, 104, 120].map((y, j) => (
                <path key={y} d={`M${66 - j * 1.5} ${y - 11} l10 11 -10 11 -10 -11 z`} fill={j % 2 ? maneDark : L.mane} />
              ))}
              <path d="M50 130 L66 130 L64 138 L52 138 Z" fill={L.accent} />
              <path d="M52 138 L50 156 L58 146 L62 158 L64 138 Z" fill={L.mane} />
            </g>
          ))}
        {L.maneStyle === 'bun' && (
          <>
            <path d="M100 -6 L106 6 L119 2 L114 14 L124 22 L111 25 L108 34 L100 28 L92 34 L89 25 L76 22 L86 14 L81 2 L94 6 Z" fill={L.mane} />
            <path d="M88 28 L112 28" stroke={L.accent} strokeWidth="5" />
          </>
        )}
      </g>

      {!hat && ears}

      {/* head */}
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        <path
          d="M100 28 L122 34 L135 58 L130 84 L124 100 L122 114 L111 125 L89 125 L78 114 L76 100 L70 84 L65 58 L78 34 Z"
          fill={L.coat}
        />
        <path d="M100 28 L122 34 L135 58 L130 84 L124 100 L122 114 L111 125 L100 125 Z" fill={coatDark} opacity="0.3" stroke="none" />
        {L.blaze && (
          <path d="M101 30 L108 50 L99 54 L107 76 L98 78 L103 92 L95 92 L93 72 L101 68 L92 48 Z" fill="#ffffff" stroke="none" opacity="0.95" />
        )}
        {/* muzzle */}
        <path d="M79 100 L89 91 L111 91 L121 100 L122 114 L111 125 L89 125 L78 114 Z" fill={coatLight} />
        <path d="M100 91 L111 91 L121 100 L122 114 L111 125 L100 125 Z" fill={coatDark} opacity="0.22" stroke="none" />
        <path d="M86 105 L93 100 L94 107 Z M114 105 L107 100 L106 107 Z" fill={INK} stroke="none" />
        {/* the smirk */}
        <path
          d={speaking ? 'M90 113 L104 114 L113 109 L106 121 L94 120 Z' : 'M90 114 L104 116 L114 108'}
          fill={speaking ? '#3a0a22' : 'none'}
          strokeLinecap="round"
        >
          {speaking && (
            <animate
              attributeName="d"
              dur="0.3s"
              repeatCount="indefinite"
              values="M90 113 L104 114 L113 109 L106 121 L94 120 Z;M90 114 L104 115 L113 109 L106 116 L94 116 Z;M90 113 L104 114 L113 109 L106 121 L94 120 Z"
            />
          )}
        </path>
        {L.accessory === 'septum' && (
          <path d="M95 107 Q100 118 105 107" fill="none" stroke={STEEL} strokeWidth="3" strokeLinecap="round" />
        )}

        {L.freckles && (
          <g fill={coatDark} stroke="none">
            {[
              [73, 80],
              [78, 78],
              [76, 85],
              [81, 83],
              [127, 80],
              [122, 78],
              [124, 85],
              [119, 83]
            ].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" />
            ))}
          </g>
        )}

        {/* eyes: sharp and half shut */}
        {eye}
        <g transform={MIRROR}>{eye}</g>
        {/* brows, one with a slit */}
        <g opacity={L.maneStyle === 'swoosh' ? 0.001 : 1} strokeWidth="4.6" strokeLinecap="square" stroke={maneDark}>
          <path d="M71 49 L93 55" />
          <path d="M129 49 L120 51.500 M115 53 L107 55" />
        </g>
      </g>

      {/* mane in front */}
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        {L.maneStyle === 'long' && (
          <>
            <path d="M100 22 L76 32 L70 58 L80 46 L84 60 L92 44 L98 58 L106 42 L116 54 L120 42 L130 56 L124 32 Z" fill={L.mane} />
            <path d="M92 44 L98 58 L106 42 L100 26 Z" fill={L.accent} />
          </>
        )}
        {L.maneStyle === 'mohawk' && (
          <>
            <path d="M84 46 L74 10 L88 26 L88 -8 L99 20 L106 -12 L111 22 L124 2 L116 46 L100 36 Z" fill={L.mane} />
            <path d="M88 -8 L92 6 L88 10 Z M106 -12 L108 4 L103 6 Z M124 2 L119 14 L116 10 Z M74 10 L82 20 L78 22 Z" fill={L.accent} stroke="none" />
          </>
        )}
        {L.maneStyle === 'curly' && (
          <g fill={L.mane}>
            <circle cx="74" cy="46" r="10" />
            <circle cx="126" cy="46" r="10" />
            <circle cx="84" cy="32" r="12" />
            <circle cx="116" cy="32" r="12" fill={L.accent} />
            <circle cx="100" cy="24" r="14" />
            <circle cx="92" cy="40" r="8" stroke="none" />
            <circle cx="108" cy="40" r="8" stroke="none" />
            <path d="M92 20 Q98 14 104 20 M78 30 Q83 25 88 30" fill="none" stroke={maneDark} strokeWidth="1.6" />
          </g>
        )}
        {L.maneStyle === 'braids' && (
          <>
            <path d="M100 24 L76 32 L68 56 L80 48 L90 54 L100 38 L110 54 L120 48 L132 56 L124 32 Z" fill={L.mane} />
            <path d="M100 24 L100 38" stroke={maneDark} fill="none" />
          </>
        )}
        {L.maneStyle === 'buzz' && (
          <>
            <path d="M82 38 L100 24 L118 38 L114 48 L100 38 L86 48 Z" fill={L.mane} />
            <path d="M88 40 L94 34 L92 40 L98 33" fill="none" stroke={L.accent} strokeWidth="2" />
          </>
        )}
        {L.maneStyle === 'bun' && (
          <path d="M100 26 L80 32 L74 54 L84 46 L90 56 L98 42 L106 54 L114 44 L126 54 L120 32 Z" fill={L.mane} />
        )}
        {L.maneStyle === 'swoosh' && (
          <>
            <path d="M108 20 L72 28 L58 56 L60 90 L70 72 L74 86 L84 64 L90 76 L100 58 L110 66 L134 58 L126 32 Z" fill={L.mane} />
            <path d="M84 64 L90 76 L100 58 L96 40 Z" fill={L.accent} />
            <path d="M72 40 L66 62 M110 30 L106 52" fill="none" stroke={maneDark} strokeWidth="1.6" />
          </>
        )}

        {/* extras */}
        {L.accessory === 'beanie' && (
          <>
            <path d="M68 50 L72 22 L100 10 L128 22 L132 50 Z" fill={L.accent} />
            <path d="M65 42 L135 42 L136 55 L64 55 Z" fill={INK} />
            <path d="M92 45 L108 45 L108 52 L92 52 Z" fill={STEEL} stroke="none" />
            <path d="M78 24 L82 40 M100 14 L100 40 M122 24 L118 40" fill="none" stroke={shade(L.accent, -0.35)} strokeWidth="1.6" />
          </>
        )}
        {L.accessory === 'cap' && (
          <>
            <path d="M68 48 L72 24 L100 14 L128 24 L132 48 Z" fill={INK} />
            <path d="M88 26 L112 26 L110 40 L90 40 Z" fill={L.accent} />
            <path d="M66 46 L134 46 L150 58 L100 52 L50 58 Z" fill={L.accent} />
          </>
        )}
        {L.accessory === 'bandana' && (
          <>
            <path d="M66 44 L134 44 L134 55 L66 55 Z" fill={L.accent} />
            <path d="M76 47 l3 3 -3 3 -3 -3 z M92 47 l3 3 -3 3 -3 -3 z M108 47 l3 3 -3 3 -3 -3 z M124 47 l3 3 -3 3 -3 -3 z" fill={INK} stroke="none" />
            <path d="M134 46 L150 40 L146 52 L154 60 L134 55 Z" fill={L.accent} />
          </>
        )}
        {L.accessory === 'glasses' && (
          <g fill="rgba(255,255,255,0.12)" strokeWidth="3.4">
            <path d="M68 58 L97 58 L95 76 L71 76 Z" />
            <path d="M132 58 L103 58 L105 76 L129 76 Z" />
            <path d="M97 63 L103 63" fill="none" />
          </g>
        )}
        {L.accessory === 'shades' && (
          <g>
            <path d="M64 56 L136 56 L132 72 L108 76 L100 68 L92 76 L68 72 Z" fill={`url(#lens${uid})`} />
            <path d="M70 60 L92 60 M112 60 L122 60" stroke="#ffffff" strokeWidth="1.6" opacity="0.8" />
          </g>
        )}
        {L.accessory === 'bow' && (
          <g fill={L.accent}>
            <path d="M120 30 L142 16 L138 30 L144 46 Z" />
            <path d="M120 30 L100 16 L104 30 L98 44 Z" />
            <path d="M115 25 L125 25 L125 35 L115 35 Z" fill={INK} />
          </g>
        )}
        {L.accessory === 'earring' && (
          <>
            <circle cx="66" cy="30" r="8" fill="none" stroke={INK} strokeWidth="5" />
            <circle cx="66" cy="30" r="8" fill="none" stroke={STEEL} strokeWidth="2.6" />
            <path d="M134 22 l4 7 -4 7 -4 -7 z" fill={L.accent} />
          </>
        )}
      </g>

      {hat && ears}

      {L.accessory === 'headphones' && (
        <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
          <path d="M62 66 L66 30 L84 14 L116 14 L134 30 L138 66" fill="none" stroke={INK} strokeWidth="10" />
          <path d="M62 66 L66 30 L84 14 L116 14 L134 30 L138 66" fill="none" stroke={L.accent} strokeWidth="5" />
          <path d="M54 56 L70 52 L72 88 L56 86 Z" fill={INK} />
          <path d="M146 56 L130 52 L128 88 L144 86 Z" fill={INK} />
          <path d="M59 62 L66 60 L67 80 L60 79 Z M141 62 L134 60 L133 80 L140 79 Z" fill={L.accent} stroke="none" />
        </g>
      )}
    </svg>
  )
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

/** A random fit, for the shuffle button. */
export function randomLook(): Look {
  return {
    coat: pick(['#b8794a', '#4a382c', '#e6dfd2', '#23232b', '#e9bd7c', '#7d4c30', '#9a958f', '#c2c7d6']),
    mane: pick(['#ff2bd6', '#0e0e14', '#7c3aed', '#f4f4f5', '#00e5ff', '#c6ff00', '#ff5a1f', '#e11d48', '#2b1a12']),
    maneStyle: pick(['long', 'mohawk', 'curly', 'braids', 'buzz', 'bun', 'swoosh']),
    top: pick(['hoodie', 'tee', 'crop', 'jersey', 'flannel', 'bomber']),
    topColor: pick(['#14101f', '#1d1d26', '#7c3aed', '#b91c1c', '#2d3a2f', '#f5f5f4', '#3b0764', '#0f172a']),
    jeans: pick(['baggy', 'skinny', 'ripped', 'shorts', 'skirt']),
    jeansColor: pick(['#5f7fd0', '#34426e', '#17171f', '#8fa6e0', '#2a2a36', '#4b5a8f']),
    sneakers: pick(['#ffffff', '#0e0e14', '#ff2bd6', '#c6ff00', '#00e5ff', '#ff5a1f', '#ef4444']),
    accessory: pick(['none', 'headphones', 'beanie', 'cap', 'glasses', 'shades', 'bow', 'earring', 'chain', 'septum', 'bandana', 'choker']),
    accent: pick(['#ff2bd6', '#00e5ff', '#c6ff00', '#ffd60a', '#ff5a1f', '#b388ff', '#ff3b5c']),
    lashes: Math.random() < 0.5,
    blaze: Math.random() < 0.45,
    freckles: Math.random() < 0.35
  }
}
