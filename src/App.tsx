import { useEffect, useState } from "react"
import { Route, Routes, Navigate, Outlet, useLocation } from "react-router-dom"
import type { Session } from "@supabase/supabase-js"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import Transaction from "./pages/Transaction"
import Dashboard from "./pages/Dashboard"
import BudgetManagement from "./pages/BudgetManagement"
import SavingGoals from "./pages/SavingGoals"
import Calendar from "./pages/Calendar"
import Profile from "./pages/Profile"
import NavBar from "./components/NavBar"
import { supabase } from "./supabaseClient"

function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    let isMounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setIsCheckingSession(false)
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setIsCheckingSession(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { session, isCheckingSession }
}

function SessionLoading() {
  return <div className="auth-loading" role="status">Checking your session...</div>
}

function PublicOnlyRoutes() {
  const { session, isCheckingSession } = useAuthSession()

  if (isCheckingSession) return <SessionLoading />
  if (session) return <Navigate to="/Transaction" replace />

  return <Outlet />
}

function ProtectedRoutes() {
  const { session, isCheckingSession } = useAuthSession()
  const location = useLocation()

  if (isCheckingSession) return <SessionLoading />

  if (!session) {
    return <Navigate to="/Login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

function AppShell() {
  return <><NavBar /><div className="app-content"><Outlet /></div></>
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Login" replace />} />
      <Route element={<PublicOnlyRoutes />}>
        <Route path="/Login" element={<Login />} />
        <Route path="/Signup" element={<Signup />} />
      </Route>
      <Route element={<ProtectedRoutes />}>
        <Route element={<AppShell />}>
          <Route path="/Dashboard" element={<Dashboard />} />
          <Route path="/Transaction" element={<Transaction />} />
          <Route path="/BudgetManagement" element={<BudgetManagement />} />
          <Route path="/SavingGoals" element={<SavingGoals />} />
          <Route path="/Calendar" element={<Calendar />} />
          <Route path="/Profile" element={<Profile />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
