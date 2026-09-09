# Signup with Validation and reCAPTCHA Implementation Guide

## Overview
Your signup component now includes:
- ✅ Email validation
- ✅ Password validation with strength requirements
- ✅ Password confirmation matching
- ✅ Google reCAPTCHA v3 integration
- ✅ Real-time error messages
- ✅ Loading states

## Setup Instructions

### 1. Get reCAPTCHA Keys
1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Sign in with your Google account
3. Click "Create" and configure:
   - **Label**: Your project name
   - **reCAPTCHA type**: Select "reCAPTCHA v3"
   - **Domains**: Add your domain(s) (e.g., localhost, yourdomain.com)
4. Accept terms and submit
5. Copy your **Site Key** and **Secret Key**

### 2. Configure Environment Variables
Update `.env.local` with your keys:
```env
VITE_RECAPTCHA_SITE_KEY=your_site_key_here
VITE_RECAPTCHA_SECRET_KEY=your_secret_key_here
```

### 3. Backend reCAPTCHA Verification
You need a backend endpoint to verify the reCAPTCHA token. Example Node.js/Express:

```javascript
const express = require('express');
const axios = require('axios');

app.post('/api/verify-recaptcha', async (req, res) => {
    const token = req.body.token;
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    
    try {
        const response = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify`,
            null,
            {
                params: {
                    secret: secretKey,
                    response: token,
                },
            }
        );
        
        const { success, score } = response.data;
        
        // reCAPTCHA v3 returns a score (0.0 to 1.0)
        // Higher score = more likely to be legitimate
        if (success && score > 0.5) {
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, message: 'reCAPTCHA verification failed' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Verification error' });
    }
});
```

### 4. Complete the Signup API
In the Signup component, uncomment and complete the signup API call in the `handleSignup` function:

```javascript
const response = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: formData.email,
        password: formData.password,
        recaptchaToken: token,
    }),
});

if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Signup failed');
}
```

## Validation Rules

### Email
- Must be a valid email format (user@domain.com)

### Password
- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (!@#$%^&*)

### Confirm Password
- Must match the password field

## Features

### Real-time Validation
- Errors clear when user starts typing
- Inline error messages below each field
- Visual feedback with red borders on invalid fields

### reCAPTCHA v3
- No user interaction required
- Automatic bot detection
- Score-based trust assessment

### User Feedback
- Loading state while processing
- Success message on account creation
- Auto-redirect to login after 2 seconds
- Error messages for all validation failures

## Testing

1. Start your dev server: `npm run dev`
2. Navigate to the signup page
3. Test validation by:
   - Entering invalid email
   - Entering weak password
   - Mismatching confirm password
   - Correct signup attempt

## Troubleshooting

**reCAPTCHA not appearing/working:**
- Verify VITE_RECAPTCHA_SITE_KEY is set correctly
- Check browser console for errors
- Ensure domain is registered in reCAPTCHA console

**"reCAPTCHA is not available" error:**
- Confirm GoogleReCaptchaProvider is wrapping your app in main.tsx
- Check that the site key is valid

**Verification fails on backend:**
- Verify your secret key is correct
- Check that you're sending the token correctly
- Ensure score threshold (0.5 in example) is appropriate for your use case
