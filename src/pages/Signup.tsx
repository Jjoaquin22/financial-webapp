import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReCaptcha from 'react-google-recaptcha';

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
        <div
            style={{
                maxWidth: '400px',
                margin: '50px auto',
                padding: '20px',
            }}
        >
            <h2>Sign Up</h2>

           

            {errors.general && (
                <div
                    style={{
                        color: 'red',
                        marginBottom: '15px',
                        padding: '10px',
                        backgroundColor: '#ffe0e0',
                        borderRadius: '4px',
                    }}
                >
                    {errors.general}
                </div>
            )}

            {successMessage && (
                <div
                    style={{
                        color: 'green',
                        marginBottom: '15px',
                        padding: '10px',
                        backgroundColor: '#e0ffe0',
                        borderRadius: '4px',
                    }}
                >
                    {successMessage}
                </div>
            )}

            <form onSubmit={handleSignup}>

                {/* Email */}
                <div style={{ marginBottom: '15px' }}>
                    <input
                        type="email"
                        name="email"
                        placeholder="Email"
                        value={formData.email}
                        onChange={handleChange}
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '4px',
                            border: errors.email
                                ? '2px solid red'
                                : '1px solid #ccc',
                            boxSizing: 'border-box',
                        }}
                    />

                    {errors.email && (
                        <p
                            style={{
                                color: 'red',
                                fontSize: '12px',
                                marginTop: '5px',
                            }}
                        >
                            {errors.email}
                        </p>
                    )}
                </div>

                {/* Password */}
                <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex' }}>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            placeholder="Password"
                            value={formData.password}
                            onChange={handleChange}
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: '4px 0 0 4px',
                                border: errors.password
                                    ? '2px solid red'
                                    : '1px solid #ccc',
                                boxSizing: 'border-box',
                            }}
                        />

                        <button
                            type="button"
                            onClick={() =>
                                setShowPassword(!showPassword)
                            }
                            style={{
                                padding: '10px',
                                border: '1px solid #ccc',
                                backgroundColor: '#f5f5f5',
                                cursor: 'pointer',
                                borderRadius: '0 4px 4px 0',
                            }}
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>

                    {errors.password && (
                        <p
                            style={{
                                color: 'red',
                                fontSize: '12px',
                                marginTop: '5px',
                            }}
                        >
                            {errors.password}
                        </p>
                    )}
                </div>

                {/* Confirm Password */}
                <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex' }}>
                        <input
                            type={
                                showConfirmPassword
                                    ? 'text'
                                    : 'password'
                            }
                            name="confirmPassword"
                            placeholder="Confirm Password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: '4px 0 0 4px',
                                border: errors.confirmPassword
                                    ? '2px solid red'
                                    : '1px solid #ccc',
                                boxSizing: 'border-box',
                            }}
                        />

                        <button
                            type="button"
                            onClick={() =>
                                setShowConfirmPassword(
                                    !showConfirmPassword
                                )
                            }
                            style={{
                                padding: '10px',
                                border: '1px solid #ccc',
                                backgroundColor: '#f5f5f5',
                                cursor: 'pointer',
                                borderRadius: '0 4px 4px 0',
                            }}
                        >
                            {showConfirmPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>

                    {errors.confirmPassword && (
                        <p
                            style={{
                                color: 'red',
                                fontSize: '12px',
                                marginTop: '5px',
                            }}
                        >
                            {errors.confirmPassword}
                        </p>
                    )}
                </div>

                {/* reCAPTCHA v2 Checkbox */}
                <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
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

                <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: isLoading
                            ? '#ccc'
                            : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isLoading
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '16px',
                    }}
                >
                    {isLoading ? 'Signing up...' : 'Sign Up'}
                </button>
            </form>

            <p
                style={{
                    textAlign: 'center',
                    marginTop: '20px',
                }}
            >
                Already have an account?{' '}
                <Link to="/Login">Login here</Link>
            </p>
        </div>
    );
}

export default Signup;
