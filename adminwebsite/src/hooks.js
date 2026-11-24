import { useEffect, useState } from 'react'

/** Runs an async action, tracking busy state and the last error message. */
export function useAction(action) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async (...args) => {
    setBusy(true)
    setError(null)
    try {
      return await action(...args)
    } catch (caught) {
      setError(caught.message)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, error, setError }
}

/**
 * Loads data with `load()` whenever `deps` change, and again on `reload()`. While new deps load,
 * data from old deps is hidden (so you never edit the wrong class); a reload keeps showing it.
 */
export function useLoad(load, deps) {
  const depsKey = JSON.stringify(deps)
  const [version, setVersion] = useState(0)
  const requestKey = `${depsKey}#${version}`
  const [state, setState] = useState({ depsKey: null, requestKey: null, data: null, error: null })

  useEffect(() => {
    let live = true
    load()
      .then((data) => live && setState({ depsKey, requestKey, data, error: null }))
      .catch((error) => live && setState((current) => ({ ...current, depsKey, requestKey, error: error.message })))
    return () => {
      live = false
    }
    // `load` is rebuilt every render; the keys say when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  return {
    data: state.depsKey === depsKey ? state.data : null,
    error: state.depsKey === depsKey ? state.error : null,
    loading: state.requestKey !== requestKey,
    reload: () => setVersion((n) => n + 1),
    setData: (data) => setState((current) => ({ ...current, data })),
  }
}
