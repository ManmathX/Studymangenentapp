import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.currentSession()?.user ?? null)

  useEffect(() => api.setSessionExpiredHandler(() => setUser(null)), [])

  // A saved session may predate a role change; ask the server who we are.
  useEffect(() => {
    if (!api.currentSession()) return
    api
      .refreshUser()
      .then(setUser)
      .catch(() => {})
  }, [])

  const login = useCallback(async (email, password) => setUser(await api.login(email, password)), [])
  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, login, logout, can: (permission) => api.can(user, permission) }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
