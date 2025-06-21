const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Email configuration
const emailConfig = {
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
};

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

// In-memory storage
const verificationCodes = new Map();
const verificationAttempts = new Map();

// Generate 6-digit code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Rate limiting
function checkRateLimit(email) {
    const key = `rate_${email}`;
    const now = Date.now();
    const attempts = verificationAttempts.get(key) || [];
    const recentAttempts = attempts.filter(time => now - time < 3600000);
    if (recentAttempts.length >= 5) return false;
    recentAttempts.push(now);
    verificationAttempts.set(key, recentAttempts);
    return true;
}

// Email template
function getEmailTemplate(code) {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .logo { font-size: 2rem; font-weight: bold; margin-bottom: 10px; }
        .content { padding: 40px; text-align: center; }
        .code { background: linear-gradient(45deg, #00b4d8, #48cae4); color: white; font-size: 2rem; font-weight: bold; padding: 20px; border-radius: 10px; letter-spacing: 8px; margin: 20px 0; display: inline-block; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 0.9rem; }
    </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">VideoFlow</div>
                <div>Meet anyone, anywhere</div>
            </div>
            <div class="content">
                <h2>Welcome to VideoFlow!</h2>
                <p>Use this verification code to complete your account setup:</p>
                <div class="code">${code}</div>
                <p>This code will expire in <strong>10 minutes</strong>.</p>
            </div>
            <div class="footer">
                <p>If you didn't request this code, you can safely ignore this email.</p>
                <p>© 2025 VideoFlow</p>
            </div>
        </div>
    </body>
    </html>`;
}

app.get('/api/health', (req, res) => {
    res.json({ message: 'Server is working' });
});

app.get('/api/test-email', async (req, res) => {
    try {
        await transporter.verify();
        res.json({ 
            message: 'Email configuration verified!',
            emailUser: process.env.EMAIL_USER,
            status: 'Ready to send emails'
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Email config failed',
            details: error.message 
        });
    }
});

// Send verification email
app.post('/api/send-email-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email address is required' });
        }
        
        if (!checkRateLimit(email)) {
            return res.status(429).json({ error: 'Too many attempts. Try again later.' });
        }
        
        const code = generateVerificationCode();
        verificationCodes.set(email, {
            code,
            expires: Date.now() + 10 * 60 * 1000
        });
        
        const mailOptions = {
            from: { name: 'VideoFlow', address: process.env.EMAIL_USER },
            to: email,
            subject: 'VideoFlow - Your Verification Code',
            html: getEmailTemplate(code)
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${email}: ${info.messageId}`);
        
        res.json({ 
            success: true, 
            message: 'Verification email sent!',
            messageId: info.messageId 
        });
        
    } catch (error) {
        console.error('❌ Email error:', error);
        res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
});

// Verify code
app.post('/api/verify-email-code', (req, res) => {
    const { email, code } = req.body;
    const stored = verificationCodes.get(email);
    
    if (!stored) {
        return res.status(400).json({ error: 'No code found for this email' });
    }
    if (Date.now() > stored.expires) {
        verificationCodes.delete(email);
        return res.status(400).json({ error: 'Code expired' });
    }
    if (stored.code !== code) {
        return res.status(400).json({ error: 'Invalid code' });
    }
    
    verificationCodes.delete(email);
    res.json({ success: true, message: 'Email verified!' });
});

// Create user
app.post('/api/create-user', (req, res) => {
    const { email, firstName, lastName } = req.body;
    const user = {
        userId: 'user-' + Math.random().toString(36).slice(2, 10),
        email, firstName, lastName,
        createdAt: new Date().toISOString(),
        verified: true
    };
    res.json({ success: true, user });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`✅ VideoFlow email server running on port ${PORT}`);
});