import api from './client'

// Auth
export const login = (username, password) =>
  api.post('/auth/login', { username, password })

// Skills
export const getSkills = () => api.get('/skills')
export const createSkill = (data) => api.post('/skills', data)

// Employees
export const getEmployees = () => api.get('/employees')
export const getEmployee = (id) => api.get(`/employees/${id}`)
export const createEmployee = (data) => api.post('/employees', data)
export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data)
export const deactivateEmployee = (id) => api.delete(`/employees/${id}`)
export const getEmployeeSkills = (id) => api.get(`/employees/${id}/skills`)
export const assignSkill = (id, data) => api.post(`/employees/${id}/skills`, data)
export const removeSkill = (empId, skillId) => api.delete(`/employees/${empId}/skills/${skillId}`)
export const getAvailability = (id) => api.get(`/employees/${id}/availability`)
export const setAvailability = (id, data) => api.put(`/employees/${id}/availability`, data)

// Companies
export const getCompanies = () => api.get('/companies')
export const createCompany = (data) => api.post('/companies', data)
export const updateCompany = (id, data) => api.put(`/companies/${id}`, data)

// Contracts
export const getContracts = () => api.get('/contracts')
export const getContract = (id) => api.get(`/contracts/${id}`)
export const createContract = (data) => api.post('/contracts', data)
export const getRequirements = (contractId) => api.get(`/contracts/${contractId}/requirements`)
export const createRequirement = (contractId, data) => api.post(`/contracts/${contractId}/requirements`, data)
export const getRequirement = (reqId) => api.get(`/requirements/${reqId}`)

// Billing types
export const getBillingTypes = () => api.get('/billing-types')

// Assignments
export const getEligibleEmployees = (reqId, startDate, endDate) =>
  api.get(`/requirements/${reqId}/eligible-employees`, { params: { startDate, endDate } })
export const getAssignmentsByRequirement = (reqId) =>
  api.get(`/requirements/${reqId}/assignments`)
export const getAssignmentsByContract = (contractId) =>
  api.get(`/contracts/${contractId}/assignments`)
export const createAssignment = (data) => api.post('/assignments', data)
export const cancelAssignment = (id) => api.delete(`/assignments/${id}`)
export const getMyAssignments = (employeeId) =>
  api.get('/assignments/mine', { params: { employeeId } })
export const suggestAssignments = (contractId) =>
  api.get(`/contracts/${contractId}/suggest-assignments`)
export const bulkAssign = (data) =>
  api.post('/assignments/bulk', data)

// Work Logs
export const submitWorklog = (data) => api.post('/worklogs', data)
export const approveWorklog = (id, data) => api.put(`/worklogs/${id}/approve`, data)
export const getPendingWorklogs = (from, to) =>
  api.get('/worklogs', { params: { from, to } })
export const getApprovedWorklogs = () => api.get('/worklogs/approved')
export const getMyWorklogs = (employeeId, from, to) =>
  api.get('/worklogs/mine', { params: { employeeId, from, to } })

// Invoices
export const generateInvoice = (data) => api.post('/invoices', data)
export const approveInvoice = (id) => api.put(`/invoices/${id}/approve`)
export const getInvoicesByContract = (contractId) =>
  api.get(`/contracts/${contractId}/invoices`)
export const getAllInvoices = () => api.get('/invoices')
export const getInvoice = (id) => api.get(`/invoices/${id}`)
export const downloadInvoiceReport = (id) =>
  api.get(`/invoices/${id}/report`, { responseType: 'blob' })

// Milestones
export const createMilestone = (contractId, data) =>
  api.post(`/contracts/${contractId}/milestones`, data)
export const getMilestonesByContract = (contractId) =>
  api.get(`/contracts/${contractId}/milestones`)
export const markMilestoneReached = (id) => api.put(`/milestones/${id}/reach`)
export const approveMilestone = (id) => api.put(`/milestones/${id}/approve`)
export const getMilestonesByStatus = (status = 'REACHED') =>
  api.get('/milestones', { params: { status } })

// Tasks
export const getTasksByMilestone = (milestoneId) =>
  api.get(`/milestones/${milestoneId}/tasks`)
export const createRootTask = (milestoneId, data) =>
  api.post(`/milestones/${milestoneId}/tasks`, data)
export const createSubtask = (parentTaskId, data) =>
  api.post(`/tasks/${parentTaskId}/subtasks`, data)
export const updateTaskStatus = (taskId, status) =>
  api.put(`/tasks/${taskId}/status`, { status })
export const deleteTask = (taskId) => api.delete(`/tasks/${taskId}`)
export const getMyTasks = () => api.get('/tasks/mine')

// Roles
export const getRoles = () => api.get('/roles')
export const createRole = (data) => api.post('/roles', data)
export const updateRole = (id, data) => api.put(`/roles/${id}`, data)
export const updateRolePermissions = (id, permissionIds) =>
  api.put(`/roles/${id}/permissions`, { permissionIds })
export const deleteRole = (id) => api.delete(`/roles/${id}`)

// Permissions
export const getPermissions = () => api.get('/permissions')

// Users
export const getUsers = () => api.get('/users')
export const createUser = (data) => api.post('/users', data)
export const updateUserRoles = (id, roleIds) => api.put(`/users/${id}/roles`, { roleIds })
export const deactivateUser = (id) => api.put(`/users/${id}/deactivate`)
export const resetUserPassword = (id, password) =>
  api.post(`/users/${id}/reset-password`, { password })

// ---------------------------------------------------------------------------
// Contract Intelligence — document intake, AI-assisted extraction, validation
// ---------------------------------------------------------------------------
export const uploadContractDocument = (file, { contractId, companyId } = {}) => {
  const form = new FormData()
  form.append('file', file)
  if (contractId) form.append('contractId', contractId)
  if (companyId) form.append('companyId', companyId)
  return api.post('/contract-documents', form)
}
export const getContractDocuments = (contractId) =>
  api.get('/contract-documents', { params: contractId ? { contractId } : {} })
export const getContractDocument = (id) => api.get(`/contract-documents/${id}`)
export const getContractDocumentText = (id) => api.get(`/contract-documents/${id}/text`)
export const runContractExtraction = (id) => api.post(`/contract-documents/${id}/extract`)
export const reviewExtraction = (extractionId, body) =>
  api.put(`/contract-documents/extractions/${extractionId}/review`, body)
export const applyExtractions = (id) => api.post(`/contract-documents/${id}/apply`)

// ---------------------------------------------------------------------------
// Invoice Auditor — deterministic three-way reconciliation
// ---------------------------------------------------------------------------
export const runInvoiceAudit = (invoiceId) => api.post(`/invoices/${invoiceId}/audit`)
export const getInvoiceAudit = (invoiceId) => api.get(`/invoices/${invoiceId}/audit`)
export const getInvoiceAuditHistory = (invoiceId) => api.get(`/invoices/${invoiceId}/audit/history`)
export const overrideInvoiceAudit = (invoiceId, reason) =>
  api.post(`/invoices/${invoiceId}/audit/override`, { reason })
export const getAuditRules = () => api.get('/invoice-audit/rules')
