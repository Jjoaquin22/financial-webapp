import { useState, type ReactNode } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { supabase } from "../supabaseClient"
import { FinauraLogo } from "./FinauraLogo"
import { NotificationCenter } from "./NotificationCenter"
import "./NavBar.css"

type IconName = "dashboard" | "transactions" | "budget" | "goals" | "calendar" | "profile" | "logout" | "menu" | "close"

const navigationItems: Array<{ label: string; path: string; icon: IconName }> = [
    { label: "Dashboard", path: "/Dashboard", icon: "dashboard" },
    { label: "Transactions", path: "/Transaction", icon: "transactions" },
    { label: "Budget management", path: "/BudgetManagement", icon: "budget" },
    { label: "Saving goals", path: "/SavingGoals", icon: "goals" },
    { label: "Calendar", path: "/Calendar", icon: "calendar" },
    { label: "Profile", path: "/Profile", icon: "profile" },
]

function NavIcon({ name }: { name: IconName }) {
    const paths: Record<IconName, ReactNode> = {
        dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
        transactions: <><path d="M4 7h14m-4-4 4 4-4 4" /><path d="M20 17H6m4 4-4-4 4-4" /></>,
        budget: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M16 10h5v5h-5a2.5 2.5 0 0 1 0-5Z" /><path d="M7 5V3h10v2" /></>,
        goals: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="m14.8 9.2 5-5M16.5 4.2h3.3v3.3" /></>,
        calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4m8-4v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></>,
        profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
        logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="M14 8l4 4-4 4m4-4H8" /></>,
        menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
        close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    }
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function NavBar() {
    const [isOpen, setIsOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [logoutError, setLogoutError] = useState("")
    const navigate = useNavigate()

    const handleLogout = async () => {
        setIsLoggingOut(true)
        setLogoutError("")
        const { error } = await supabase.auth.signOut()
        if (error) {
            setLogoutError(error.message)
            setIsLoggingOut(false)
            return
        }
        setIsOpen(false)
        navigate("/Login", { replace: true })
    }

    return (
        <>
            <button className="sidebar-toggle" type="button" aria-label={isOpen ? "Close navigation" : "Open navigation"} aria-expanded={isOpen} aria-controls="primary-sidebar" onClick={() => setIsOpen((current) => !current)}>
                <NavIcon name={isOpen ? "close" : "menu"} />
            </button>

            {isOpen && <button className="sidebar-overlay" type="button" aria-label="Close navigation" onClick={() => setIsOpen(false)} />}

            <aside id="primary-sidebar" className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
                <NavLink className="sidebar-brand" to="/Dashboard" aria-label="Finaura dashboard" onClick={() => setIsOpen(false)}>
                    <FinauraLogo showTagline />
                </NavLink>

                <NotificationCenter />

                <p className="sidebar-section-label">Workspace</p>
                <nav className="sidebar-nav" aria-label="Main navigation">
                    {navigationItems.map((item) => (
                        <NavLink key={item.path} to={item.path} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} onClick={() => setIsOpen(false)}>
                            <span className="sidebar-icon"><NavIcon name={item.icon} /></span>
                            <span>{item.label}</span>
                            <span className="sidebar-active-mark" aria-hidden="true" />
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-security"><span aria-hidden="true" />Protected financial workspace</div>
                    {logoutError && <p className="sidebar-error" role="alert">{logoutError}</p>}
                    <button className="sidebar-logout" type="button" disabled={isLoggingOut} onClick={() => void handleLogout()}>
                        <span className="sidebar-icon"><NavIcon name="logout" /></span>
                        <span>{isLoggingOut ? "Logging out..." : "Log out"}</span>
                    </button>
                </div>
            </aside>
        </>
    )
}

export default NavBar
