import { useState } from 'react'
import { Icon } from './ui.jsx'

/** A list of short texts: type and press Enter (or comma) to add, × to remove. */
export function ChipsInput({ values, onChange, placeholder, suggestions = [], max = 40, label }) {
  const [text, setText] = useState('')
  const add = (raw) => {
    const value = raw.trim()
    if (!value || values.length >= max || values.some((item) => item.toLowerCase() === value.toLowerCase())) return
    onChange([...values, value])
  }
  const commit = () => {
    text.split(',').forEach(add)
    setText('')
  }
  const unused = suggestions.filter((item) => !values.includes(item))
  return (
    <div className="chips-input">
      <div className="chips">
        {values.map((value) => (
          <span key={value} className="chip">
            {value}
            <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          value={text}
          aria-label={label}
          placeholder={values.length ? '' : placeholder}
          onChange={(e) => {
            if (e.target.value.endsWith(',')) {
              add(e.target.value.slice(0, -1))
              setText('')
            } else setText(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1))
          }}
          onBlur={commit}
        />
      </div>
      {unused.length ? (
        <div className="row small">
          <span className="muted">Add:</span>
          {unused.slice(0, 12).map((item) => (
            <button key={item} type="button" className="link-button" onClick={() => add(item)}>
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
