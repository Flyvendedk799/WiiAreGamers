import { useId } from 'react'
import type { Game } from './types.ts'

export function ChannelArt({ game, className }: { game: Pick<Game, 'id' | 'palette' | 'motif'>; className?: string }) {
  const raw = useId()
  const id = `art-${game.id}-${raw.replace(/:/g, '')}`
  const [ink, mid, wash] = game.palette

  return (
    <svg className={className} viewBox="0 0 160 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-wash`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={wash} />
          <stop offset="1" stopColor={ink} />
        </linearGradient>
      </defs>
      <rect width="160" height="220" fill={`url(#${id}-wash)`} />
      <Motif motif={game.motif} color={mid} />
      <rect x="12" y="12" width="136" height="196" fill="none" stroke={ink} strokeOpacity="0.35" />
    </svg>
  )
}

function Motif({ motif, color }: { motif: Game['motif']; color: string }) {
  if (motif === 'lanes') {
    return (
      <g fill="none" stroke={color} strokeWidth="8" strokeLinecap="round">
        <path d="M-8 168 C 46 132, 78 96, 172 28" />
        <path d="M-8 196 C 54 154, 96 112, 176 58" opacity="0.65" />
        <path d="M18 224 C 78 170, 108 128, 188 86" opacity="0.4" />
      </g>
    )
  }
  if (motif === 'orbit') {
    return (
      <g fill="none" stroke={color} strokeWidth="1.5">
        <circle cx="86" cy="104" r="18" fill={color} fillOpacity="0.85" stroke="none" />
        <ellipse cx="86" cy="104" rx="58" ry="22" transform="rotate(-18 86 104)" />
        <ellipse cx="86" cy="104" rx="46" ry="70" transform="rotate(24 86 104)" opacity="0.7" />
        <circle cx="132" cy="78" r="5" fill={color} stroke="none" />
        <circle cx="48" cy="146" r="3.5" fill={color} stroke="none" opacity="0.7" />
      </g>
    )
  }
  if (motif === 'coins') {
    return (
      <g fill={color}>
        <circle cx="48" cy="72" r="16" />
        <circle cx="108" cy="58" r="10" opacity="0.75" />
        <circle cx="92" cy="112" r="22" opacity="0.9" />
        <circle cx="46" cy="148" r="8" opacity="0.55" />
        <circle cx="124" cy="156" r="13" opacity="0.8" />
      </g>
    )
  }
  if (motif === 'burst') {
    return (
      <g stroke={color} strokeWidth="2" strokeLinecap="round">
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 12
          const x2 = 80 + Math.cos(angle) * 62
          const y2 = 110 + Math.sin(angle) * 62
          return <line key={index} x1="80" y1="110" x2={x2} y2={y2} opacity={index % 2 ? 0.45 : 0.9} />
        })}
        <circle cx="80" cy="110" r="10" fill={color} stroke="none" />
      </g>
    )
  }
  if (motif === 'ridge') {
    return (
      <g fill={color}>
        <path d="M0 168 L38 96 L62 132 L98 58 L128 124 L160 78 L160 220 L0 220 Z" opacity="0.92" />
        <path d="M0 188 L52 140 L90 168 L160 112 L160 220 L0 220 Z" opacity="0.45" />
      </g>
    )
  }
  return (
    <g fill={color}>
      <rect x="28" y="36" width="28" height="28" />
      <rect x="66" y="36" width="28" height="28" opacity="0.45" />
      <rect x="104" y="36" width="28" height="28" opacity="0.75" />
      <rect x="28" y="74" width="28" height="28" opacity="0.55" />
      <rect x="66" y="74" width="28" height="28" />
      <rect x="104" y="74" width="28" height="28" opacity="0.35" />
      <rect x="28" y="112" width="28" height="28" opacity="0.8" />
      <rect x="66" y="112" width="28" height="28" opacity="0.4" />
      <rect x="104" y="112" width="28" height="28" />
    </g>
  )
}
