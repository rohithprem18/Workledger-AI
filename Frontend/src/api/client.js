import axios from 'axios'

// Same-origin '/api' by default, which is what the Vite dev proxy and the nginx
// container both serve. A split deploy — static frontend on one host, API on
// another — sets VITE_API_BASE_URL at build time to the API's absolute URL.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({ baseURL })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('wb_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  // The API wraps every payload in { success, data, message }; unwrap it here so
  // no caller has to know that.
  r => r.data?.data ?? r.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wb_token')
      localStorage.removeItem('wb_user')
      window.location.href = '/login'
    }
    return Promise.reject(
      err.response?.data?.message ?? err.message ?? 'Request failed'
    )
  }
)

export default api
