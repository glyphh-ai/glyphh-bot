import { useMemo } from 'react'
import { ACCESSORIES, EXTRAS, EYES, HEADS, POSES, TAILS, type Look } from '../../shared/types'
import { catMarkup } from './catArt'

interface Props {
  look: Look
  size?: number
  /** 'head' crops to the head for the rail; 'full' shows the whole cat. */
  mode?: 'head' | 'full'
  speaking?: boolean
  busy?: boolean
  className?: string
}

/** A bot: Spike, the Glyphh cat, in black and white, with the bot's own parts. */
export function Cat({ look, size = 48, mode = 'head', speaking, busy, className = '' }: Props): JSX.Element {
  const html = useMemo(() => catMarkup(look), [look.head, look.tail, look.eye, look.extra, look.accessory, look.pose])
  const full = mode === 'full'
  return (
    <svg
      className={`cat-svg ${look.pose === 'hop' ? 'pose-hop' : ''} ${speaking ? 'talking' : ''} ${busy ? 'busy' : ''} ${className}`}
      width={size}
      height={full ? size * 1.21 : size}
      viewBox={full ? '-6 -8 177 214' : '6 -4 158 158'}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const pick = <T,>(all: T[]): T => all[Math.floor(Math.random() * all.length)]!

/** A random cat for a new bot or the Shuffle button. */
export function randomLook(): Look {
  return {
    head: pick(HEADS),
    tail: pick(TAILS),
    eye: pick(EYES),
    extra: pick(EXTRAS),
    accessory: pick(ACCESSORIES),
    pose: pick(POSES)
  }
}
