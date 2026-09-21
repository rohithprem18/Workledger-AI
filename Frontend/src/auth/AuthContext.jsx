import { createContext, useContext, useState, useCallback } from 'react'
import { login as apiLogin } from '../api'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('wb_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const login = useCallback(async (username, password) => {
    const data = await apiLogin(username, password)
    const { token, roles, permissions, employeeId } = data
    const claims = parseJwt(token)
    const userObj = {
      token,
      username: data.username ?? claims.sub,
      roles: roles ?? [],
      permissions: permissions ?? [],
      employeeId: employeeId ?? null,
    }
    localStorage.setItem('wb_token', token)
    localStorage.setItem('wb_user', JSON.stringify(userObj))
    setUser(userObj)
    return userObj
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('wb_token')
    localStorage.removeItem('wb_user')
    setUser(null)
  }, [])

  const roles = user?.roles ?? []
  const isManager = roles.includes('MANAGER')
  const isEmployee = roles.includes('EMPLOYEE')
  const isHR = roles.includes('HR_MANAGER')
  const isFinance = roles.includes('FINANCE_MANAGER')
  const isAdmin = roles.includes('PLATFORM_ADMIN')
  const isAuditor = roles.includes('AUDITOR')
  const hasPermission = (p) => user?.permissions?.includes(p)
  const hasAnyRole = (...names) => names.some((n) => roles.includes(n))
  const hasAnyPermission = (...perms) => perms.some((p) => user?.permissions?.includes(p))

  const defaultRoute = isAdmin
    ? '/dashboard'
    : isHR
    ? '/hr/employees'
    : isFinance
    ? '/finance/invoices'
    : isManager
    ? '/dashboard'
    : isAuditor
    ? '/finance/audit'
    : isEmployee
    ? '/my-assignments'
    : '/login'

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isManager,
        isEmployee,
        isHR,
        isFinance,
        isAdmin,
        isAuditor,
        hasPermission,
        hasAnyRole,
        hasAnyPermission,
        defaultRoute,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
