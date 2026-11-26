import { useState } from 'react'
import { apiUrl } from '../api.js'

/** The exam's uploaded logo, or a coloured badge with its short name. */
export function ExamLogo({ exam, size = 36 }) {
  const [broken, setBroken] = useState(false)
  const url = apiUrl(exam?.logoUrl)
  const style = { width: size, height: size, borderRadius: Math.round(size / 4) }
  if (url && !broken) return <img className="exam-logo" src={url} alt="" style={style} onError={() => setBroken(true)} />
  const text = monogram(exam?.shortName || exam?.name || '?', exam?.name)
  return (
    <span className="exam-logo monogram" style={{ ...style, background: exam?.color ?? '#8E8E93', fontSize: size * (text.length > 3 ? 0.26 : 0.34) }} aria-hidden="true">
      {text}
    </span>
  )
}

function monogram(name, fullName = '') {
  // "Odisha Board (BSE)" → BSE
  const acronym = `${fullName} ${name}`.match(/\(([A-Z]{2,5})\)/)
  if (acronym) return acronym[1]
  const words = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 1 && words[0].length > 4) return words[0].slice(0, 3).toUpperCase()
  if (words[0] && words[0].length <= 4 && words[0] === words[0].toUpperCase()) return words[0]
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}
