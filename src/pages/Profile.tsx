import { useCallback, useEffect, useState, type FormEvent } from "react"
import { supabase } from "../supabaseClient"
import type { TablesInsert } from "../types/database"
import "./Profile.css"

type ProfileForm = {
    firstName: string
    middleName: string
    lastName: string
    phoneNumber: string
    birthDate: string
}

type Notice = { kind: "success" | "error"; text: string }

const emptyProfile: ProfileForm = {
    firstName: "",
    middleName: "",
    lastName: "",
    phoneNumber: "",
    birthDate: "",
}

function Profile() {
    const [form, setForm] = useState<ProfileForm>(emptyProfile)
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [notice, setNotice] = useState<Notice | null>(null)

    const loadProfile = useCallback(async () => {
        setIsLoading(true)
        setNotice(null)
        try {
            const { data: userData, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            if (!userData.user) throw new Error("You must be signed in to view your profile.")

            setEmail(userData.user.email ?? "")
            const { data, error } = await supabase
                .from("profiles")
                .select("first_name, middle_name, last_name, phone_number, birth_date")
                .eq("id", userData.user.id)
                .maybeSingle()
            if (error) throw error

            setForm(data ? {
                firstName: data.first_name ?? "",
                middleName: data.middle_name ?? "",
                lastName: data.last_name ?? "",
                phoneNumber: data.phone_number ?? "",
                birthDate: data.birth_date ?? "",
            } : emptyProfile)
        } catch (error) {
            setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load your profile." })
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        const timeoutId = window.setTimeout(() => void loadProfile(), 0)
        return () => window.clearTimeout(timeoutId)
    }, [loadProfile])

    const updateField = <Key extends keyof ProfileForm>(key: Key, value: ProfileForm[Key]) => {
        setForm((current) => ({ ...current, [key]: value }))
        setNotice(null)
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setIsSaving(true)
        setNotice(null)

        try {
            const { data: userData, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            if (!userData.user) throw new Error("You must be signed in to update your profile.")

            const profile: TablesInsert<"profiles"> = {
                id: userData.user.id,
                first_name: form.firstName.trim() || null,
                middle_name: form.middleName.trim() || null,
                last_name: form.lastName.trim() || null,
                phone_number: form.phoneNumber.trim() || null,
                birth_date: form.birthDate || null,
                updated_at: new Date().toISOString(),
            }
            const { data, error } = await supabase
                .from("profiles")
                .upsert(profile, { onConflict: "id" })
                .select("first_name, middle_name, last_name, phone_number, birth_date")
                .single()
            if (error) throw error

            setForm({
                firstName: data.first_name ?? "",
                middleName: data.middle_name ?? "",
                lastName: data.last_name ?? "",
                phoneNumber: data.phone_number ?? "",
                birthDate: data.birth_date ?? "",
            })
            setNotice({ kind: "success", text: "Profile saved successfully." })
        } catch (error) {
            setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to save your profile." })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <main className="profile-page">
            <section className="profile-heading">
                <p className="eyebrow">Account</p>
                <h1>Personal profile</h1>
                <p>Keep your personal information accurate and up to date.</p>
            </section>

            <section className="profile-card" aria-labelledby="profile-form-title">
                <div className="profile-card-heading">
                    <div>
                        <h2 id="profile-form-title">Profile details</h2>
                        <p>These details are stored securely with your Finaura account.</p>
                    </div>
                    <div className="profile-avatar" aria-hidden="true">{(form.firstName || email || "U").charAt(0).toUpperCase()}</div>
                </div>

                {notice && <div className={`profile-notice profile-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}

                {isLoading ? <div className="profile-loading" role="status">Loading profile…</div> :
                    <form onSubmit={handleSubmit}>
                        <div className="profile-form-grid">
                            <label><span>First name</span><input type="text" autoComplete="given-name" maxLength={100} value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} /></label>
                            <label><span>Middle name</span><input type="text" autoComplete="additional-name" maxLength={100} value={form.middleName} onChange={(event) => updateField("middleName", event.target.value)} /></label>
                            <label><span>Last name</span><input type="text" autoComplete="family-name" maxLength={100} value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} /></label>
                            <label><span>Phone number</span><input type="tel" autoComplete="tel" maxLength={30} placeholder="e.g. +63 912 345 6789" value={form.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} /></label>
                            <label><span>Birth date</span><input type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} /></label>
                            <label><span>Email</span><input type="email" autoComplete="email" value={email} disabled /><small>Email is managed by your sign-in account.</small></label>
                        </div>
                        <div className="profile-actions"><button className="profile-save" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save profile"}</button></div>
                    </form>}
            </section>
        </main>
    )
}

export default Profile
