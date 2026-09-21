import axios from 'axios'

// Same-origin '/api' by default, which is what the Vite dev proxy and the
// Vercel deployment both serve. A split deploy — frontend on one host, API on
// another — sets VITE_API_BASE_URL at build time to the API's absolute URL.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({ baseURL })

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('wb_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  // The API wraps JSON payloads in { success, data, message }. Unwrap only
  // that envelope — `data` may legitimately be null ("no audit yet"), and a
  // blob download has no envelope at all.
  (r) =>
    r.data && typeof r.data === 'object' && 'success' in r.data ? r.data.data : r.data,
  (err) => {
    const isLogin = err.config?.url?.includes('/auth/login')
    // An expired session sends you back to sign in; a wrong password on the
    // sign-in form must not, or the error would vanish in the reload.
    if (err.response?.status === 401 && !isLogin) {
      localStorage.removeItem('wb_token')
      localStorage.removeItem('wb_user')
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }
    return Promise.reject(err.response?.data?.message ?? err.message ?? 'Request failed')
  },
)

export default api
