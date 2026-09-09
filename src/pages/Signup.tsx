import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReCaptcha from 'react-google-recaptcha';
import { supabase } from '../supabaseClient';
import './Auth.css';

interface SignupFormData { email: string; password: string; confirmPassword: string; }
type SignupErrors = Partial<Record<keyof SignupFormData | 'captcha' | 'general', string>>;
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

function validate(data: SignupFormData): SignupErrors {
    const errors: SignupErrors = {};
    if (!data.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = 'Enter a valid email address';
    if (!data.password) errors.password = 'Password is required';
    else if (data.password.length < 8) errors.password = 'Use at least 8 characters';
    else if (!/[A-Z]/.test(data.password)) errors.password = 'Include an uppercase letter';
    else if (!/[a-z]/.test(data.password)) errors.password = 'Include a lowercase letter';
    else if (!/\d/.test(data.password)) errors.password = 'Include a number';
    else if (!/[^A-Za-z0-9]/.test(data.password)) errors.password = 'Include a special character';
    if (!data.confirmPassword) errors.confirmPassword = 'Confirm your password';
    else if (data.password !== data.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    return errors;
}

function Signup() {
    const navigate = useNavigate();
    const captchaRef = useRef<ReCaptcha>(null);
    const [formData, setFormData] = useState<SignupFormData>({ email: '', password: '', confirmPassword: '' });
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [errors, setErrors] = useState<SignupErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const field = event.target.name as keyof SignupFormData;
        setFormData((current) => ({ ...current, [field]: event.target.value }));
        setErrors((current) => ({ ...current, [field]: undefined, general: undefined }));
    };

    const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const nextErrors = validate(formData);
        if (!siteKey) nextErrors.general = 'reCAPTCHA is not configured.';
        else if (!captchaToken) nextErrors.captcha = 'Please complete the reCAPTCHA verification';
        if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }

        setErrors({});
        setSuccessMessage('');
        setIsLoading(true);
        const { error } = await supabase.auth.signUp({
            email: formData.email.trim(),
            password: formData.password,
            options: { captchaToken: captchaToken! },
        });
        if (error) {
            setErrors({ general: error.message });
            setCaptchaToken(null);
            captchaRef.current?.reset();
            setIsLoading(false);
            return;
        }
        setSuccessMessage('Account created. Check your email to verify your account.');
        setIsLoading(false);
        window.setTimeout(() => navigate('/Login'), 2500);
    };

    return (
        <main className="auth-page">
            <section className="auth-card" aria-labelledby="signup-title">
                <h1 id="signup-title">Create account</h1>
                {errors.general && <div className="auth-alert auth-alert--error" role="alert">{errors.general}</div>}
                {successMessage && <div className="auth-alert auth-alert--success" role="status">{successMessage}</div>}
                <form onSubmit={handleSignup} noValidate>
                    <label className="auth-field"><span>Email</span><input type="email" name="email" autoComplete="email" value={formData.email} onChange={handleChange} disabled={isLoading} aria-invalid={Boolean(errors.email)} />{errors.email && <small className="auth-error">{errors.email}</small>}</label>
                    <label className="auth-field"><span>Password</span><input type="password" name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} disabled={isLoading} aria-invalid={Boolean(errors.password)} />{errors.password && <small className="auth-error">{errors.password}</small>}</label>
                    <label className="auth-field"><span>Confirm password</span><input type="password" name="confirmPassword" autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange} disabled={isLoading} aria-invalid={Boolean(errors.confirmPassword)} />{errors.confirmPassword && <small className="auth-error">{errors.confirmPassword}</small>}</label>
                    {siteKey && <div className="auth-captcha"><ReCaptcha ref={captchaRef} sitekey={siteKey} onChange={(token) => { setCaptchaToken(token); setErrors((current) => ({ ...current, captcha: undefined, general: undefined })); }} onExpired={() => setCaptchaToken(null)} onErrored={() => { setCaptchaToken(null); setErrors((current) => ({ ...current, captcha: 'reCAPTCHA could not be loaded. Please try again.' })); }} /></div>}
                    {errors.captcha && <p className="auth-error auth-error--center" role="alert">{errors.captcha}</p>}
                    <button className="auth-submit" type="submit" disabled={isLoading}>{isLoading ? 'Creating account...' : 'Sign up'}</button>
                </form>
                <p className="auth-footer">Already have an account? <Link to="/Login">Login</Link></p>
            </section>
        </main>
    );
}

export default Signup;
