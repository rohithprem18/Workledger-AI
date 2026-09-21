import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ children, roles, permission }) {
  const { user, defaultRoute, hasAnyRole, hasPermission } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && roles.length > 0 && !hasAnyRole(...roles)) {
    return <Navigate to={defaultRoute} replace />
  }
  if (permission && !hasPermission(permission)) {
    return <Navigate to={defaultRoute} replace />
  }
  return children
}

export function RoleLanding() {
  const { user, defaultRoute } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={defaultRoute} replace />
}
