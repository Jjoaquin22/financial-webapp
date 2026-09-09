/**
 * DIAGNOSTIC TEST FOR reCAPTCHA
 * 
 * Copy this code into your browser console (F12 → Console tab) to diagnose
 * Paste each section and press Enter, then check the output
 */

// ============================================================
// TEST 1: Check if reCAPTCHA global is loaded
// ============================================================
console.log('=== TEST 1: Global reCAPTCHA Object ===');
console.log('window.grecaptcha exists:', typeof window.grecaptcha !== 'undefined');
console.log('window.grecaptcha:', window.grecaptcha);

// ============================================================
// TEST 2: Check environment variables
// ============================================================
console.log('\n=== TEST 2: Environment Variables ===');
console.log('VITE_RECAPTCHA_SITE_KEY:', import.meta.env.VITE_RECAPTCHA_SITE_KEY);
console.log('Key is set:', !!import.meta.env.VITE_RECAPTCHA_SITE_KEY);

// ============================================================
// TEST 3: Check for script errors in Network tab
// ============================================================
console.log('\n=== TEST 3: Check Network Tab ===');
console.log('Instructions:');
console.log('1. Open DevTools → Network tab');
console.log('2. Refresh page');
console.log('3. Search for: "recaptcha"');
console.log('4. Look for failed requests (red X) - these indicate problems');
console.log('5. Check status codes - 403/401 means domain not authorized');

// ============================================================
// TEST 4: React Google reCAPTCHA Hook
// ============================================================
console.log('\n=== TEST 4: React Hook Status ===');
console.log('Check if you see this message: "✓ reCAPTCHA initialized successfully"');
console.log('If you see: "⚠ reCAPTCHA not initialized..." then look at warnings above');

// ============================================================
// TEST 5: Most Common Causes (in order of likelihood)
// ============================================================
console.log('\n=== COMMON CAUSES (Most to Least Likely) ===');
console.log('1. Domain NOT added to Google reCAPTCHA console');
console.log('   → Solution: Add "localhost:5173" to console.cloud.google.com');
console.log('');
console.log('2. Wrong site key in .env');
console.log('   → Solution: Copy exact key from Google Console');
console.log('');
console.log('3. Site key from different reCAPTCHA project');
console.log('   → Solution: Verify you selected the correct project');
console.log('');
console.log('4. reCAPTCHA script blocked by adblocker/extension');
console.log('   → Solution: Try disabling browser extensions');
console.log('');
console.log('5. Firewall/VPN blocking Google domains');
console.log('   → Solution: Check if recaptcha.net is accessible');

// ============================================================
// QUICK FIX CHECKLIST
// ============================================================
console.log('\n=== QUICK FIX CHECKLIST ===');
console.log('[ ] 1. Go to: https://www.google.com/recaptcha/admin');
console.log('[ ] 2. Select your project');
console.log('[ ] 3. Click Settings (gear icon)');
console.log('[ ] 4. Scroll to "Domains"');
console.log('[ ] 5. VERIFY "localhost:5173" is in the list');
console.log('[ ] 6. If missing, click "+" and add it');
console.log('[ ] 7. Stop dev server (Ctrl+C)');
console.log('[ ] 8. Restart dev server (npm run dev)');
console.log('[ ] 9. Refresh browser page');
console.log('[ ] 10. Badge should turn GREEN');
