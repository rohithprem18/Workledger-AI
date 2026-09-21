import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute, RoleLanding } from './auth/ProtectedRoute'
import Login from './pages/Login'
import Shell from './components/Shell'

import Dashboard from './pages/manager/Dashboard'
import Clients from './pages/manager/Clients'
import Contracts from './pages/manager/Contracts'
import ContractDetail from './pages/manager/ContractDetail'
import ContractIntake from './pages/manager/ContractIntake'
import ManagerEmployees from './pages/manager/Employees'
import WorklogApproval from './pages/manager/WorklogApproval'

import MyAssignments from './pages/employee/MyAssignments'
import MyWorklogs from './pages/employee/MyWorklogs'
import SubmitWorklog from './pages/employee/SubmitWorklog'
import MyAvailability from './pages/employee/MyAvailability'

import HrEmployees from './pages/hr/Employees'
import HrUsers from './pages/hr/Users'
import HrRoles from './pages/hr/Roles'
import HrSkills from './pages/hr/Skills'

import FinanceWorklogs from './pages/finance/Worklogs'
import FinanceInvoices from './pages/finance/Invoices'
import FinanceMilestones from './pages/finance/Milestones'
import InvoiceAudit from './pages/finance/InvoiceAudit'

// PLATFORM_ADMIN reaches every module, so it is added to each guard rather than
// given a parallel set of routes.
const ADMIN = 'PLATFORM_ADMIN'

function Guard({ roles, children }) {
  return (
    <ProtectedRoute roles={[...roles, ADMIN]}>
      <Shell>{children}</Shell>
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

          {/* Delivery manager */}
          <Route path="/dashboard"         element={<Guard roles={['MANAGER']}><Dashboard /></Guard>} />
          <Route path="/contracts"         element={<Guard roles={['MANAGER', 'AUDITOR']}><Contracts /></Guard>} />
          <Route path="/contracts/:id"     element={<Guard roles={['MANAGER', 'FINANCE_MANAGER', 'AUDITOR']}><ContractDetail /></Guard>} />
          <Route path="/contracts/intake"  element={<Guard roles={['MANAGER']}><ContractIntake /></Guard>} />
          <Route path="/clients"           element={<Guard roles={['MANAGER']}><Clients /></Guard>} />
          <Route path="/employees"         element={<Guard roles={['MANAGER']}><ManagerEmployees /></Guard>} />
          <Route path="/worklogs/pending"  element={<Guard roles={['MANAGER']}><WorklogApproval /></Guard>} />

          {/* Contractor */}
          <Route path="/my-assignments"    element={<Guard roles={['EMPLOYEE']}><MyAssignments /></Guard>} />
          <Route path="/my-worklogs"       element={<Guard roles={['EMPLOYEE']}><MyWorklogs /></Guard>} />
          <Route path="/my-worklogs/new"   element={<Guard roles={['EMPLOYEE']}><SubmitWorklog /></Guard>} />
          <Route path="/my-availability"   element={<Guard roles={['EMPLOYEE']}><MyAvailability /></Guard>} />

          {/* HR */}
          <Route path="/hr/employees"      element={<Guard roles={['HR_MANAGER']}><HrEmployees /></Guard>} />
          <Route path="/hr/users"          element={<Guard roles={['HR_MANAGER']}><HrUsers /></Guard>} />
          <Route path="/hr/roles"          element={<Guard roles={['HR_MANAGER']}><HrRoles /></Guard>} />
          <Route path="/hr/skills"         element={<Guard roles={['HR_MANAGER']}><HrSkills /></Guard>} />

          {/* Finance */}
          <Route path="/finance/worklogs"   element={<Guard roles={['FINANCE_MANAGER']}><FinanceWorklogs /></Guard>} />
          <Route path="/finance/invoices"   element={<Guard roles={['FINANCE_MANAGER']}><FinanceInvoices /></Guard>} />
          <Route path="/finance/audit"      element={<Guard roles={['FINANCE_MANAGER', 'AUDITOR']}><InvoiceAudit /></Guard>} />
          <Route path="/finance/milestones" element={<Guard roles={['FINANCE_MANAGER']}><FinanceMilestones /></Guard>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
