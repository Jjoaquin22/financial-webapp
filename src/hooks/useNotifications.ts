import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "../supabaseClient"
import type { Tables } from "../types/database"

export type Notification = Tables<"notifications">

const NOTIFICATION_LIMIT = 30

function sortNotifications(notifications: Notification[]) {
    return [...notifications].sort((left, right) => (
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    )).slice(0, NOTIFICATION_LIMIT)
}

export function useNotifications() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let isMounted = true
        let channel: RealtimeChannel | null = null

        const connect = async () => {
            setIsLoading(true)
            setError("")

            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (!isMounted) return
            if (userError || !user) {
                setError(userError?.message ?? "Unable to load notifications.")
                setIsLoading(false)
                return
            }

            const now = new Date().toISOString()
            const { data, error: queryError } = await supabase
                .from("notifications")
                .select("*")
                .eq("user_id", user.id)
                .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
                .order("created_at", { ascending: false })
                .limit(NOTIFICATION_LIMIT)

            if (!isMounted) return
            if (queryError) {
                setError(queryError.message)
            } else {
                setNotifications(data ?? [])
            }
            setIsLoading(false)

            channel = supabase
                .channel(`notifications-${user.id}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
                    (payload) => {
                        const notification = payload.new as Notification
                        if (notification.scheduled_for && new Date(notification.scheduled_for) > new Date()) return
                        setNotifications((current) => sortNotifications([
                            notification,
                            ...current.filter(({ id }) => id !== notification.id),
                        ]))
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
                    (payload) => {
                        const notification = payload.new as Notification
                        setNotifications((current) => sortNotifications(current.map((item) => (
                            item.id === notification.id ? notification : item
                        ))))
                    },
                )
                .subscribe((status) => {
                    if (isMounted && status === "CHANNEL_ERROR") {
                        setError("Live notification updates are temporarily unavailable.")
                    }
                })
        }

        void connect()

        return () => {
            isMounted = false
            if (channel) void supabase.removeChannel(channel)
        }
    }, [])

    const markAsRead = useCallback(async (notificationId: string) => {
        const readAt = new Date().toISOString()
        const { data, error: updateError } = await supabase
            .from("notifications")
            .update({ is_read: true, read_at: readAt })
            .eq("id", notificationId)
            .select("id")

        if (updateError) throw updateError
        if (!data?.length) throw new Error("Notification not found or access denied.")
        setNotifications((current) => current.map((notification) => (
            notification.id === notificationId
                ? { ...notification, is_read: true, read_at: readAt }
                : notification
        )))
    }, [])

    const markAllAsRead = useCallback(async () => {
        if (!notifications.some(({ is_read }) => !is_read)) return

        const readAt = new Date().toISOString()
        const { data, error: updateError } = await supabase
            .from("notifications")
            .update({ is_read: true, read_at: readAt })
            .eq("is_read", false)
            .select("id")

        if (updateError) throw updateError
        if (!data) throw new Error("Notifications could not be updated.")
        setNotifications((current) => current.map((notification) => (
            !notification.is_read
                ? { ...notification, is_read: true, read_at: readAt }
                : notification
        )))
    }, [notifications])

    return {
        notifications,
        unreadCount: notifications.filter(({ is_read }) => !is_read).length,
        isLoading,
        error,
        markAsRead,
        markAllAsRead,
    }
}
