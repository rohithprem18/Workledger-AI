import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute, RoleLanding } from './auth/ProtectedRoute'
import Shell from './components/Shell'
import Login from './pages/Login'
import { Skeleton } from './components/ui'

// Each page is its own chunk, so the sign-in screen does not download the
// calendar, the auditor and every table in the app before it can render.
const Dashboard = lazy(() => import('./pages/manager/Dashboard'))
const Clients = lazy(() => import('./pages/manager/Clients'))
const Contracts = lazy(() => import('./pages/manager/Contracts'))
const ContractDetail = lazy(() => import('./pages/manager/ContractDetail'))
const ContractIntake = lazy(() => import('./pages/manager/ContractIntake'))
const ManagerEmployees = lazy(() => import('./pages/manager/Employees'))
const WorklogApproval = lazy(() => import('./pages/manager/WorklogApproval'))

const MyAssignments = lazy(() => import('./pages/employee/MyAssignments'))
const MyWorklogs = lazy(() => import('./pages/employee/MyWorklogs'))
const SubmitWorklog = lazy(() => import('./pages/employee/SubmitWorklog'))
const MyAvailability = lazy(() => import('./pages/employee/MyAvailability'))

const HrEmployees = lazy(() => import('./pages/hr/Employees'))
const HrUsers = lazy(() => import('./pages/hr/Users'))
const HrRoles = lazy(() => import('./pages/hr/Roles'))
const HrSkills = lazy(() => import('./pages/hr/Skills'))

const FinanceWorklogs = lazy(() => import('./pages/finance/Worklogs'))
const FinanceInvoices = lazy(() => import('./pages/finance/Invoices'))
const FinanceMilestones = lazy(() => import('./pages/finance/Milestones'))
const InvoiceAudit = lazy(() => import('./pages/finance/InvoiceAudit'))

// PLATFORM_ADMIN reaches every module, so it is added to each guard rather
// than given a parallel set of routes.
const ADMIN = 'PLATFORM_ADMIN'

function PageFallback() {
  return (
    <div className="stack gap-16" aria-busy="true">
      <Skeleton height={12} width={100} />
      <Skeleton height={34} width="40%" />
      <Skeleton height={16} width="60%" />
      <Skeleton height={260} style={{ marginTop: 16 }} />
    </div>
  )
}

function Guard({ roles, children }) {
  return (
    <ProtectedRoute roles={[...roles, ADMIN]}>
      <Shell>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </Shell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleLanding />} />

          {/* Delivery */}
          <Route path="/dashboard" element={<Guard roles={['MANAGER']}><Dashboard /></Guard>} />
          <Route path="/contracts" element={<Guard roles={['MANAGER', 'AUDITOR']}><Contracts /></Guard>} />
          <Route path="/contracts/intake" element={<Guard roles={['MANAGER']}><ContractIntake /></Guard>} />
          <Route path="/contracts/:id" element={<Guard roles={['MANAGER', 'FINANCE_MANAGER', 'AUDITOR']}><ContractDetail /></Guard>} />
          <Route path="/clients" element={<Guard roles={['MANAGER']}><Clients /></Guard>} />
          <Route path="/employees" element={<Guard roles={['MANAGER']}><ManagerEmployees /></Guard>} />
          <Route path="/worklogs/pending" element={<Guard roles={['MANAGER']}><WorklogApproval /></Guard>} />

          {/* Contractor */}
          <Route path="/my-assignments" element={<Guard roles={['EMPLOYEE']}><MyAssignments /></Guard>} />
          <Route path="/my-worklogs" element={<Guard roles={['EMPLOYEE']}><MyWorklogs /></Guard>} />
          <Route path="/my-worklogs/new" element={<Guard roles={['EMPLOYEE']}><SubmitWorklog /></Guard>} />
          <Route path="/my-availability" element={<Guard roles={['EMPLOYEE']}><MyAvailability /></Guard>} />

          {/* People */}
          <Route path="/hr/employees" element={<Guard roles={['HR_MANAGER']}><HrEmployees /></Guard>} />
          <Route path="/hr/users" element={<Guard roles={['HR_MANAGER']}><HrUsers /></Guard>} />
          <Route path="/hr/roles" element={<Guard roles={['HR_MANAGER']}><HrRoles /></Guard>} />
          <Route path="/hr/skills" element={<Guard roles={['HR_MANAGER']}><HrSkills /></Guard>} />

          {/* Finance */}
          <Route path="/finance/worklogs" element={<Guard roles={['FINANCE_MANAGER']}><FinanceWorklogs /></Guard>} />
          <Route path="/finance/invoices" element={<Guard roles={['FINANCE_MANAGER']}><FinanceInvoices /></Guard>} />
          <Route path="/finance/audit" element={<Guard roles={['FINANCE_MANAGER', 'AUDITOR']}><InvoiceAudit /></Guard>} />
          <Route path="/finance/milestones" element={<Guard roles={['FINANCE_MANAGER']}><FinanceMilestones /></Guard>} />

          <Route path="*" element={<RoleLanding />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
