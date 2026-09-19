import { useEffect, useRef, useState } from "react"
import { useNotifications, type Notification } from "../hooks/useNotifications"
import "./NotificationCenter.css"

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

function formatRelativeTime(value: string) {
    const timestamp = new Date(value).getTime()
    const differenceInSeconds = Math.round((timestamp - Date.now()) / 1_000)
    if (!Number.isFinite(timestamp)) return "Recently"
    if (Math.abs(differenceInSeconds) < 60) return "Just now"
    const differenceInMinutes = Math.round(differenceInSeconds / 60)
    if (Math.abs(differenceInMinutes) < 60) return relativeTimeFormatter.format(differenceInMinutes, "minute")
    const differenceInHours = Math.round(differenceInMinutes / 60)
    if (Math.abs(differenceInHours) < 24) return relativeTimeFormatter.format(differenceInHours, "hour")
    const differenceInDays = Math.round(differenceInHours / 24)
    if (Math.abs(differenceInDays) < 7) return relativeTimeFormatter.format(differenceInDays, "day")
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(timestamp)
}

function getNotificationSymbol(notification: Notification) {
    if (notification.notification_type === "budget_alert") return "₱"
    if (notification.notification_type === "savings_milestone") return "◎"
    if (notification.notification_type === "expense_alert" || notification.notification_type === "system") return "↔"
    return "•"
}

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false)
    const [actionError, setActionError] = useState("")
    const [isMarkingAll, setIsMarkingAll] = useState(false)
    const centerRef = useRef<HTMLDivElement>(null)
    const { notifications, unreadCount, isLoading, error, markAsRead, markAllAsRead } = useNotifications()

    useEffect(() => {
        if (!isOpen) return
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (centerRef.current && !centerRef.current.contains(event.target as Node)) setIsOpen(false)
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsOpen(false)
        }
        document.addEventListener("mousedown", closeOnOutsideClick)
        document.addEventListener("keydown", closeOnEscape)
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick)
            document.removeEventListener("keydown", closeOnEscape)
        }
    }, [isOpen])

    const handleMarkAsRead = async (notificationId: string) => {
        setActionError("")
        try {
            await markAsRead(notificationId)
        } catch (updateError) {
            setActionError(updateError instanceof Error ? updateError.message : "Unable to update notification.")
        }
    }

    const handleMarkAllAsRead = async () => {
        setIsMarkingAll(true)
        setActionError("")
        try {
            await markAllAsRead()
        } catch (updateError) {
            setActionError(updateError instanceof Error ? updateError.message : "Unable to update notifications.")
        } finally {
            setIsMarkingAll(false)
        }
    }

    return (
        <div className="notification-center" ref={centerRef}>
            <button className="notification-trigger" type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={isOpen} aria-controls="notification-panel" onClick={() => setIsOpen((current) => !current)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
                <span>Notifications</span>
                {unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>

            {isOpen && (
                <section className="notification-panel" id="notification-panel" aria-label="Financial activity notifications">
                    <header>
                        <div><p>Activity center</p><h2>Notifications</h2></div>
                        {unreadCount > 0 && <button type="button" disabled={isMarkingAll} onClick={() => void handleMarkAllAsRead()}>{isMarkingAll ? "Updating…" : "Mark all read"}</button>}
                    </header>
                    {(error || actionError) && <p className="notification-error" role="alert">{actionError || error}</p>}
                    <div className="notification-list">
                        {isLoading ? <p className="notification-empty" role="status">Loading activity…</p>
                            : notifications.length === 0 ? <p className="notification-empty">Your transaction, budget, and savings updates will appear here.</p>
                                : notifications.map((notification) => (
                                    <article className={`notification-item${notification.is_read ? "" : " unread"}`} key={notification.id}>
                                        <span className={`notification-symbol notification-symbol-${notification.notification_type}`} aria-hidden="true">{getNotificationSymbol(notification)}</span>
                                        <div>
                                            <div className="notification-item-heading"><h3>{notification.title}</h3><time dateTime={notification.created_at}>{formatRelativeTime(notification.created_at)}</time></div>
                                            <p>{notification.message}</p>
                                            {!notification.is_read && <button type="button" onClick={() => void handleMarkAsRead(notification.id)}>Mark as read</button>}
                                        </div>
                                    </article>
                                ))}
                    </div>
                </section>
            )}
        </div>
    )
}
