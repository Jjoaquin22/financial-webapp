import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReCaptcha from 'react-google-recaptcha';
import { FinauraLogo } from '../components/FinauraLogo';
import './Auth.css';

interface SignupFormData {
    email: string;
    password: string;
    confirmPassword: string;
}

interface SignupErrors {
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
}

function Signup() {
    const navigate = useNavigate();

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    const [formData, setFormData] = useState<SignupFormData>({
        email: '',
        password: '',
        confirmPassword: '',
    });

    const [errors, setErrors] = useState<SignupErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Validation functions
    const validateEmail = (email: string): string | null => {
        if (!email) return 'Email is required';

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return 'Please enter a valid email address';
        }

        return null;
    };

    const validatePassword = (password: string): string | null => {
        if (!password) return 'Password is required';

        if (password.length < 8) {
            return 'Password must be at least 8 characters long';
        }

        if (!/[A-Z]/.test(password)) {
            return 'Password must contain at least one uppercase letter';
        }

        if (!/[a-z]/.test(password)) {
            return 'Password must contain at least one lowercase letter';
        }

        if (!/[0-9]/.test(password)) {
            return 'Password must contain at least one number';
        }

        if (!/[!-_@#$%^&*]/.test(password)) {
            return 'Password must contain at least one special character (!@#$%^&*)';
        }

        return null;
    };

    const validateConfirmPassword = (
        password: string,
        confirmPassword: string
    ): string | null => {
        if (!confirmPassword) return 'Please confirm your password';

        if (password !== confirmPassword) {
            return 'Passwords do not match';
        }

        return null;
    };

    // Form validation
    const validateForm = (): boolean => {
        const newErrors: SignupErrors = {};

        const emailError = validateEmail(formData.email);
        if (emailError) newErrors.email = emailError;

        const passwordError = validatePassword(formData.password);
        if (passwordError) newErrors.password = passwordError;

        const confirmError = validateConfirmPassword(
            formData.password,
            formData.confirmPassword
        );

        if (confirmError) {
            newErrors.confirmPassword = confirmError;
        }

        setErrors(newErrors);

        return Object.keys(newErrors).length === 0;
    };

    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));

        if (errors[name as keyof SignupErrors]) {
            setErrors(prev => ({
                ...prev,
                [name]: undefined,
            }));
        }
    };

    // Main signup function
    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        if (!captchaToken) {
            setErrors(prev => ({
                ...prev,
                general: 'Please complete the reCAPTCHA verification',
            }));
            return;
        }

        setIsLoading(true);
        setSuccessMessage('');

        try {
            console.log('✓ reCAPTCHA token obtained:', captchaToken.substring(0, 30) + '...');

            // Sign up with Supabase, passing the reCAPTCHA token via captchaToken option
            const { supabase } = await import('../supabaseClient');
            console.log('Attempting signup with email:', formData.email);
            const { error: signupError, data: signupData } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    captchaToken: captchaToken,
                },
            });

            console.log('Signup response:', { error: signupError, data: signupData });

            if (signupError) {
                console.error('Supabase error details:', {
                    message: signupError.message,
                    status: signupError.status,
                    code: signupError.code,
                });
                throw new Error(signupError.message);
            }

            setSuccessMessage(
                'Account created successfully!'
            );

            setTimeout(() => {
                navigate('/Login');
            }, 3000);

        } catch (error) {
            setErrors(prev => ({
                ...prev,
                general:
                    error instanceof Error
                        ? error.message
                        : 'An error occurred during signup',
            }));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="auth-page">
            <section className="auth-shell" aria-label="Create your account">
                <aside className="auth-visual">
                    <FinauraLogo inverse showTagline />
                    <h2>Build a clearer financial future.</h2>
                    <p>Join your budget, savings goals, and spending habits in one calm place.</p>
                    <ul className="auth-checklist">
                        <li>Track every expense</li>
                        <li>Plan smarter budgets</li>
                        <li>Stay on top of goals</li>
                    </ul>
                </aside>

                <div className="auth-card" aria-labelledby="signup-title">
                    <div className="auth-header">
                        <span className="auth-badge">New account</span>
                        <h1 id="signup-title">Sign up</h1>
                    </div>

                    {errors.general && <div className="auth-alert" role="alert">{errors.general}</div>}
                    {successMessage && <div className="auth-success" role="status">{successMessage}</div>}

                    <form className="auth-form" onSubmit={handleSignup} noValidate>
                        <label className="auth-field">
                            <span>Email</span>
                            <input
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                disabled={isLoading}
                                aria-invalid={Boolean(errors.email)}
                                className={errors.email ? 'is-invalid' : ''}
                            />
                            {errors.email && <small className="auth-error">{errors.email}</small>}
                        </label>

                        <label className="auth-field">
                            <span>Password</span>
                            <div className="auth-password-row">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    placeholder="Create a strong password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    disabled={isLoading}
                                    aria-invalid={Boolean(errors.password)}
                                    className={errors.password ? 'is-invalid' : ''}
                                />
                                <button
                                    type="button"
                                    className="auth-password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            {errors.password && <small className="auth-error">{errors.password}</small>}
                        </label>

                        <label className="auth-field">
                            <span>Confirm password</span>
                            <div className="auth-password-row">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    name="confirmPassword"
                                    placeholder="Confirm your password"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    disabled={isLoading}
                                    aria-invalid={Boolean(errors.confirmPassword)}
                                    className={errors.confirmPassword ? 'is-invalid' : ''}
                                />
                                <button
                                    type="button"
                                    className="auth-password-toggle"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                >
                                    {showConfirmPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            {errors.confirmPassword && <small className="auth-error">{errors.confirmPassword}</small>}
                        </label>

                        <div className="auth-captcha">
                            <ReCaptcha
                                sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''}
                                onChange={(token: string | null) => {
                                    setCaptchaToken(token);
                                    if (token) {
                                        console.log('✓ reCAPTCHA verified');
                                    }
                                }}
                            />
                        </div>

                        <button className="auth-submit" type="submit" disabled={isLoading}>
                            {isLoading ? 'Signing up...' : 'Create account'}
                        </button>
                    </form>

                    <p className="auth-footer">
                        Already have an account? <Link to="/Login">Login here</Link>
                    </p>
                </div>
            </section>
        </main>
    );
}

export default Signup;
