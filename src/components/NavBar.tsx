import { useState } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { supabase } from "../supabaseClient"
import "./NavBar.css"

const navigationItems = [
    { label: "Dashboard", path: "/Dashboard", icon: "⌂" },
    { label: "Transactions", path: "/Transaction", icon: "⇄" },
    { label: "Budget management", path: "/BudgetManagement", icon: "₱" },
    { label: "Saving goals", path: "/SavingGoals", icon: "◎" },
    { label: "Calendar", path: "/Calendar", icon: "□" },
    { label: "Profile", path: "/Profile", icon: "●" },
]

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
            <button
                className="sidebar-toggle"
                type="button"
                aria-label={isOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={isOpen}
                aria-controls="primary-sidebar"
                onClick={() => setIsOpen((current) => !current)}
            >
                <span aria-hidden="true">{isOpen ? "×" : "☰"}</span>
            </button>

            {isOpen && <button className="sidebar-overlay" type="button" aria-label="Close navigation" onClick={() => setIsOpen(false)} />}

            <aside id="primary-sidebar" className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
                <NavLink className="sidebar-brand" to="/Dashboard" onClick={() => setIsOpen(false)}>
                    <span className="sidebar-brand-mark">F</span>
                    <span>Finaura</span>
                </NavLink>

                <nav className="sidebar-nav" aria-label="Main navigation">
                    {navigationItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                            onClick={() => setIsOpen(false)}
                        >
                            <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    {logoutError && <p className="sidebar-error" role="alert">{logoutError}</p>}
                    <button className="sidebar-logout" type="button" disabled={isLoggingOut} onClick={() => void handleLogout()}>
                        <span className="sidebar-icon" aria-hidden="true">↪</span>
                        <span>{isLoggingOut ? "Logging out…" : "Log out"}</span>
                    </button>
                </div>
            </aside>
        </>
    )
}

export default NavBar
