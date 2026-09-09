import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReCaptcha from 'react-google-recaptcha';
import { supabase } from '../supabaseClient';
import './Auth.css';

interface LoginErrors {
    email?: string;
    password?: string;
    captcha?: string;
    general?: string;
}

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

function Login() {
    const captchaRef = useRef<ReCaptcha>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [errors, setErrors] = useState<LoginErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const nextErrors: LoginErrors = {};
        if (!email.trim()) nextErrors.email = 'Email is required';
        if (!password) nextErrors.password = 'Password is required';
        if (!siteKey) nextErrors.general = 'reCAPTCHA is not configured.';
        else if (!captchaToken) nextErrors.captcha = 'Please complete the reCAPTCHA verification';

        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors);
            return;
        }

        setErrors({});
        setSuccessMessage('');
        setIsLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
            options: { captchaToken: captchaToken! },
        });

        if (error) {
            setErrors({ general: error.message });
            setCaptchaToken(null);
            captchaRef.current?.reset();
        } else {
            setSuccessMessage('You are now signed in.');
        }
        setIsLoading(false);
    };

    return (
        <main className="auth-page">
            <section className="auth-card" aria-labelledby="login-title">
                <h1 id="login-title">Login</h1>
                {errors.general && <div className="auth-alert auth-alert--error" role="alert">{errors.general}</div>}
                {successMessage && <div className="auth-alert auth-alert--success" role="status">{successMessage}</div>}
                <form onSubmit={handleLogin} noValidate>
                    <label className="auth-field">
                        <span>Email</span>
                        <input type="email" name="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined, general: undefined })); }} disabled={isLoading} aria-invalid={Boolean(errors.email)} />
                        {errors.email && <small className="auth-error">{errors.email}</small>}
                    </label>
                    <label className="auth-field">
                        <span>Password</span>
                        <input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined, general: undefined })); }} disabled={isLoading} aria-invalid={Boolean(errors.password)} />
                        {errors.password && <small className="auth-error">{errors.password}</small>}
                    </label>
                    {siteKey && <div className="auth-captcha"><ReCaptcha ref={captchaRef} sitekey={siteKey} onChange={(token) => { setCaptchaToken(token); setErrors((current) => ({ ...current, captcha: undefined, general: undefined })); }} onExpired={() => setCaptchaToken(null)} onErrored={() => { setCaptchaToken(null); setErrors((current) => ({ ...current, captcha: 'reCAPTCHA could not be loaded. Please try again.' })); }} /></div>}
                    {errors.captcha && <p className="auth-error auth-error--center" role="alert">{errors.captcha}</p>}
                    <button className="auth-submit" type="submit" disabled={isLoading}>{isLoading ? 'Logging in...' : 'Login'}</button>
                </form>
                <p className="auth-footer">Need an account? <Link to="/Signup">Create one</Link></p>
            </section>
        </main>
    );
}

export default Login;
