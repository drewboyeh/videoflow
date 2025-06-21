// backend/email-server.js - Express.js server with email verification
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

// In-memory storage for verification codes
const verificationCodes = new Map();
const verificationAttempts = new Map();

// Generate 6-digit verification code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Rate limiting helper
function checkRateLimit(email) {
    const key = `rate_${email}`;
    const now = Date.now();
    const attempts = verificationAttempts.get(key) || [];
    
    const recentAttempts = attempts.filter(time => now - time < 3600000);
    
    if (recentAttempts.length >= 5) {
        return false;
    }
    
    recentAttempts.push(now);
    verificationAttempts.set(key, recentAttempts);
    return true;
}

// HTML email template
function getEmailTemplate(code) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
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
    </html>
    `;
}

// Send verification email
app.post('/api/send-email-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email address is required' });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        if (!checkRateLimit(email)) {
            return res.status(429).json({ 
                error: 'Too many verification attempts. Please try again later.' 
            });
        }
        
        const code = generateVerificationCode();
        
        verificationCodes.set(email, {
            code,
            expires: Date.now() + 10 * 60 * 1000
        });
        
        const mailOptions = {
            from: {
                name: 'VideoFlow',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: 'VideoFlow - Your Verification Code',
            html: getEmailTemplate(code),
            text: `Your VideoFlow verification code is: ${code}. This code expires in 10 minutes.`
        };
        
        const info = await transporter.sendMail(mailOptions);
        
        console.log(`Verification email sent to ${email}: ${info.messageId}`);
        
        res.json({ 
            success: true, 
            message: 'Verification email sent successfully',
            messageId: info.messageId 
        });
        
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

// Verify email code
app.post('/api/verify-email-code', (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code are required' });
        }
        
        const stored = verificationCodes.get(email);
        
        if (!stored) {
            return res.status(400).json({ error: 'No verification code found for this email' });
        }
        
        if (Date.now() > stored.expires) {
            verificationCodes.delete(email);
            return res.status(400).json({ error: 'Verification code has expired' });
        }
        
        if (stored.code !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }
        
        verificationCodes.delete(email);
        
        res.json({ 
            success: true, 
            message: 'Email verified successfully' 
        });
        
    } catch (error) {
        console.error('Error verifying code:', error);
        res.status(500).json({ error: 'Failed to verify code' });
    }
});

// Create user after verification
app.post('/api/create-user', (req, res) => {
    try {
        const { email, firstName, lastName } = req.body;
        
        if (!email || !firstName || !lastName) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const user = {
            userId: 'user-' + Math.random().toString(36).slice(2, 10),
            email,
            firstName,
            lastName,
            createdAt: new Date().toISOString(),
            verified: true
        };
        
        console.log('User created:', user);
        
        res.json({ success: true, user });
        
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', service: 'email-verification' });
});

// Test endpoint to verify email configuration
app.get('/api/test-email', async (req, res) => {
    try {
        console.log('Testing email configuration...');
        console.log('EMAIL_USER:', process.env.EMAIL_USER);
        console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set' : 'Not set');
        
        // Test the transporter
        await transporter.verify();
        console.log('✅ Email transporter verified successfully');
        
        res.json({ 
            success: true, 
            message: 'Email configuration is working',
            emailUser: process.env.EMAIL_USER
        });
        
    } catch (error) {
        console.error('❌ Email configuration error:', error);
        res.status(500).json({ 
            error: 'Email configuration failed',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Email verification server running on port ${PORT}`);
    console.log('Email service: gmail');
});