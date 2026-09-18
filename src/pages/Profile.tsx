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
    const [savedForm, setSavedForm] = useState<ProfileForm>(emptyProfile)
    const [email, setEmail] = useState("")
    const [joinedAt, setJoinedAt] = useState("")
    const [isEmailVerified, setIsEmailVerified] = useState(false)
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
            setJoinedAt(userData.user.created_at ?? "")
            setIsEmailVerified(Boolean(userData.user.email_confirmed_at))

            const { data, error } = await supabase
                .from("profiles")
                .select("first_name, middle_name, last_name, phone_number, birth_date")
                .eq("id", userData.user.id)
                .maybeSingle()
            if (error) throw error

            const loadedProfile = data ? {
                firstName: data.first_name ?? "",
                middleName: data.middle_name ?? "",
                lastName: data.last_name ?? "",
                phoneNumber: data.phone_number ?? "",
                birthDate: data.birth_date ?? "",
            } : emptyProfile
            setForm(loadedProfile)
            setSavedForm(loadedProfile)
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

            const savedProfile = {
                firstName: data.first_name ?? "",
                middleName: data.middle_name ?? "",
                lastName: data.last_name ?? "",
                phoneNumber: data.phone_number ?? "",
                birthDate: data.birth_date ?? "",
            }
            setForm(savedProfile)
            setSavedForm(savedProfile)
            setNotice({ kind: "success", text: "Profile saved successfully." })
        } catch (error) {
            setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to save your profile." })
        } finally {
            setIsSaving(false)
        }
    }

    const displayName = [form.firstName, form.middleName, form.lastName].map((part) => part.trim()).filter(Boolean).join(" ") || "Finaura member"
    const initials = [form.firstName, form.lastName].map((part) => part.trim().charAt(0)).filter(Boolean).join("").slice(0, 2).toUpperCase() || email.charAt(0).toUpperCase() || "U"
    const completedFields = Object.values(form).filter((value) => value.trim().length > 0).length
    const totalFields = Object.keys(emptyProfile).length
    const completion = Math.round((completedFields / totalFields) * 100)
    const remainingFields = totalFields - completedFields
    const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm)
    const memberSince = joinedAt && !Number.isNaN(Date.parse(joinedAt))
        ? new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(new Date(joinedAt))
        : "Unavailable"

    return (
        <main className="profile-page">
            <section className="profile-heading">
                <div>
                    <p className="eyebrow">Account</p>
                    <h1>Your profile</h1>
                    <p>Manage the personal details connected to your Finaura account.</p>
                </div>
                {!isLoading && <span className="profile-completion-pill">{completion}% complete</span>}
            </section>

            {notice && <div className={`profile-notice profile-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}

            {isLoading ? <section className="profile-card profile-loading" role="status">Loading profile...</section> :
                <div className="profile-layout">
                    <aside className="profile-summary" aria-label="Profile summary">
                        <div className="profile-identity">
                            <div className="profile-avatar" aria-hidden="true">{initials}</div>
                            <div>
                                <h2>{displayName}</h2>
                                <p>{email || "No email available"}</p>
                            </div>
                        </div>

                        <div className="profile-progress-copy">
                            <span>Profile completion</span>
                            <strong>{completion}%</strong>
                        </div>
                        <div className="profile-progress" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
                            <span style={{ width: `${completion}%` }} />
                        </div>
                        <p className="profile-progress-hint">{completion === 100 ? "Your profile information is complete." : `Add ${remainingFields} more detail${remainingFields === 1 ? "" : "s"} to complete your profile.`}</p>

                        <dl className="profile-facts">
                            <div><dt>Account status</dt><dd><span className={`profile-status-dot${isEmailVerified ? " verified" : ""}`} />{isEmailVerified ? "Email verified" : "Verification pending"}</dd></div>
                            <div><dt>Member since</dt><dd>{memberSince}</dd></div>
                            <div><dt>Data privacy</dt><dd>Private to your account</dd></div>
                        </dl>
                    </aside>

                    <section className="profile-card" aria-labelledby="profile-form-title">
                        <div className="profile-card-heading">
                            <div>
                                <p className="profile-section-kicker">Personal information</p>
                                <h2 id="profile-form-title">Profile details</h2>
                                <p>Keep these details accurate for a more personalized experience.</p>
                            </div>
                            {hasChanges && <span className="profile-unsaved">Unsaved changes</span>}
                        </div>

                        <form onSubmit={handleSubmit}>
                            <fieldset className="profile-fieldset" disabled={isSaving}>
                                <legend>Name</legend>
                                <div className="profile-form-grid profile-name-grid">
                                    <label><span>First name</span><input type="text" autoComplete="given-name" maxLength={100} placeholder="Your first name" value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} /></label>
                                    <label><span>Middle name</span><input type="text" autoComplete="additional-name" maxLength={100} placeholder="Optional" value={form.middleName} onChange={(event) => updateField("middleName", event.target.value)} /></label>
                                    <label><span>Last name</span><input type="text" autoComplete="family-name" maxLength={100} placeholder="Your last name" value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} /></label>
                                </div>
                            </fieldset>

                            <fieldset className="profile-fieldset" disabled={isSaving}>
                                <legend>Contact and personal details</legend>
                                <div className="profile-form-grid">
                                    <label><span>Phone number</span><input type="tel" autoComplete="tel" maxLength={30} placeholder="e.g. +63 912 345 6789" value={form.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} /></label>
                                    <label><span>Birth date</span><input type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} /></label>
                                    <label className="profile-email-field"><span>Email address</span><input type="email" autoComplete="email" value={email} disabled /><small>Email is managed by your sign-in account.</small></label>
                                </div>
                            </fieldset>

                            <div className="profile-actions">
                                <button className="profile-reset" type="button" disabled={!hasChanges || isSaving} onClick={() => { setForm(savedForm); setNotice(null) }}>Discard changes</button>
                                <button className="profile-save" type="submit" disabled={!hasChanges || isSaving}>{isSaving ? "Saving..." : "Save changes"}</button>
                            </div>
                        </form>
                    </section>
                </div>}
        </main>
    )
}

export default Profile
