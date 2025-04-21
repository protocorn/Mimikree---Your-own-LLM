const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const juice = require('juice'); // Add juice for CSS inlining

dotenv.config();

// Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true';
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || `"Sahil Chordia" <${EMAIL_USER}>`;

// Create reusable transporter
const createTransporter = async () => {
    const transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_SECURE,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS,
        },
        // Add additional headers to improve deliverability
        headers: {
            'List-Unsubscribe': '<mailto:' + EMAIL_USER + '?subject=unsubscribe>',
            'Precedence': 'bulk'
        }
    });
    
    // Verify connection
    await transporter.verify();
    
    return transporter;
};

// Send welcome email
const sendWelcomeEmail = async (user) => {
    try {
        const transporter = await createTransporter();
        
        // Create a unique email ID
        const emailId = `welcome-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const domain = EMAIL_USER.split('@')[1];
        
        // Get HTML with inlined CSS - now we get it directly
        const htmlContent = getWelcomeEmailTemplate(user);
        // No need for juice since we've manually inlined all styles
        
        const mailOptions = {
            from: EMAIL_FROM,
            to: user.email,
            subject: "Welcome to Mimikree - Your Digital Twin Awaits!",
            html: htmlContent,
            // Add text version for better deliverability
            text: getPlainTextVersion(user),
            // Add important headers to avoid spam filters
            headers: {
                // Standard priorities
                'X-Priority': '1',
                'Importance': 'high',
                'X-MSMail-Priority': 'High',
                // Anti-spam compliance headers
                'List-Unsubscribe': '<mailto:' + EMAIL_USER + '?subject=unsubscribe>',
                'Feedback-ID': `welcome:mimikree:${emailId}:${domain}`,
                // Prevent auto-replies from mailing lists and vacation responders
                'Precedence': 'bulk',
                'Auto-Submitted': 'auto-generated'
            },
            // Add message ID to help with identification
            messageId: `<${emailId}@${domain}>`,
            // Add a Reply-To header to encourage replies (good for deliverability)
            replyTo: EMAIL_FROM,
            // List for all recipients to signify legitimate bulk mail
            list: {
                unsubscribe: {
                    url: 'https://www.mimikree.com/unsubscribe',
                    comment: 'Unsubscribe from Mimikree emails'
                },
                help: EMAIL_USER
            }
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`Welcome email sent to ${user.email}`);
        return true;
    } catch (error) {
        console.error(`Failed to send welcome email to ${user.email}:`, error);
        return false;
    }
};

// Welcome email template
const getWelcomeEmailTemplate = (user) => {
    return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome to Mimikree</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333333; background-color: #f9f9f9;">
        <!-- Main Table -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f9f9f9">
            <tr>
                <td style="padding: 40px 0;">
                    <!-- Content Table -->
                    <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);">
                        <!-- Header -->
                        <tr>
                            <td align="center" style="padding: 30px 20px; background: linear-gradient(135deg, #4d68ff, #ff5c7d); border-radius: 12px 12px 0 0;">
                                <img src="https://res.cloudinary.com/dkyloeuir/image/upload/v1745205971/Screenshot_2025-03-06_132719_lthkye.png" alt="Mimikree Logo" width="80" style="border-radius: 12px; margin-bottom: 15px;" />
                                <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">Welcome to Mimikree!</h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <!-- Greeting -->
                                <div style="font-size: 22px; font-weight: 600; margin-bottom: 20px; color: #4d68ff;">Hello ${user.name || "there"}! 👋</div>
                                
                                <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px;">Welcome to Mimikree - your personal AI companion! I'm excited to have you join this journey of creating your digital twin.</p>
                                
                                <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px;">Your account has been successfully created, and you're now just a few steps away from creating your own AI replica that talks, thinks, and responds just like you!</p>
                                
                                <!-- Fun Fact Box -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fff5f8; border-left: 4px solid #ff5c7d; border-radius: 10px; margin-bottom: 30px;">
                                    <tr>
                                        <td style="padding: 15px;">
                                            <h2 style="color: #ff5c7d; margin-top: 0; font-size: 18px;">🤔 Fun Fact</h2>
                                            <p style="margin-bottom: 0; font-style: italic;">If your digital twin and a toaster had a conversation, your twin would probably win... unless you really love discussing bread temperatures.</p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Steps Box -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f7ff; border-radius: 10px; margin-bottom: 30px;">
                                    <tr>
                                        <td style="padding: 20px;">
                                            <h2 style="color: #4d68ff; font-size: 20px; margin-top: 0; margin-bottom: 15px;">Here's how to get started:</h2>
                                            
                                            <!-- Step 1 -->
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 15px;">
                                                <tr valign="top">
                                                    <td width="40" style="padding-right: 15px;">
                                                        <div style="background-color: #4d68ff; color: #ffffff; width: 30px; height: 30px; border-radius: 50%; display: inline-block; text-align: center; line-height: 30px; font-weight: bold;">1</div>
                                                    </td>
                                                    <td>
                                                        <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #333333;">Complete Your Profile</h3>
                                                        <p style="margin: 0; font-size: 16px;">Add your social media profiles, upload PDFs, and images that represent your personality and knowledge base.</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Step 2 -->
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 15px;">
                                                <tr valign="top">
                                                    <td width="40" style="padding-right: 15px;">
                                                        <div style="background-color: #4d68ff; color: #ffffff; width: 30px; height: 30px; border-radius: 50%; display: inline-block; text-align: center; line-height: 30px; font-weight: bold;">2</div>
                                                    </td>
                                                    <td>
                                                        <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #333333;">Fill Out Self-Assessment</h3>
                                                        <p style="margin: 0; font-size: 16px;">Tell us about your communication style, interests, and personality traits to make your digital twin even more accurate.</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Step 3 -->
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                <tr valign="top">
                                                    <td width="40" style="padding-right: 15px;">
                                                        <div style="background-color: #4d68ff; color: #ffffff; width: 30px; height: 30px; border-radius: 50%; display: inline-block; text-align: center; line-height: 30px; font-weight: bold;">3</div>
                                                    </td>
                                                    <td>
                                                        <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #333333;">Chat With Your Twin</h3>
                                                        <p style="margin: 0; font-size: 16px;">Start a conversation with your AI replica and see how accurately it mimics your style and knowledge!</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="margin-top: 0; margin-bottom: 30px; font-size: 16px;">The more information you provide, the more accurate your AI twin will be. All your data is private and secure - read our <a href="https://www.mimikree.com/privacy-policy" style="color: #4d68ff; text-decoration: underline;">privacy policy</a> for more details.</p>
                                
                                <!-- CTA Button -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px;">
                                    <tr>
                                        <td align="center">
                                            <table border="0" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td align="center" bgcolor="#4d68ff" style="padding: 12px 30px; border-radius: 50px; box-shadow: 0 4px 10px rgba(77, 104, 255, 0.3);">
                                                        <a href="https://www.mimikree.com/add-data" style="color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Complete Your Profile Now</a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Feedback Section -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f3ff; border-radius: 10px; margin-top: 30px; margin-bottom: 30px;">
                                    <tr>
                                        <td align="center" style="padding: 20px;">
                                            <h2 style="color: #4d68ff; margin-top: 0; margin-bottom: 10px;">Your Feedback Matters</h2>
                                            <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">As a solo developer, I value your input to help improve Mimikree.</p>
                                            <table border="0" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td align="center" bgcolor="#ffffff" style="padding: 10px 25px; border-radius: 50px; border: 2px solid #4d68ff;">
                                                        <a href="https://forms.gle/yhypwtSjn62W4bUF8" style="color: #4d68ff; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Share Your Thoughts</a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td align="center" style="padding: 20px 30px; border-top: 1px solid #eeeeee; color: #888888; font-size: 14px;">
                                <p style="margin-top: 0; margin-bottom: 15px;">Feel free to reply to this email if you have any questions - I'm here to help!</p>
                                
                                <!-- Social Links -->
                                <table border="0" cellpadding="0" cellspacing="0" style="margin: 15px 0;">
                                    <tr>
                                        <td>
                                            <a href="https://www.linkedin.com/in/sahil--chordia" style="display: inline-block; margin: 0 5px;">
                                                <img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" alt="LinkedIn" width="35" height="35" style="border-radius: 50%; background-color: #e0e0e0;" />
                                            </a>
                                        </td>
                                        <td>
                                            <a href="https://www.github.com/protocorn" style="display: inline-block; margin: 0 5px;">
                                                <img src="https://cdn-icons-png.flaticon.com/512/25/25231.png" alt="GitHub" width="35" height="35" style="border-radius: 50%; background-color: #e0e0e0;" />
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="margin-top: 0; margin-bottom: 15px;">&copy; 2025 Mimikree. All rights reserved.</p>
                                
                                <!-- Physical address -->
                                <div style="margin-top: 15px; font-size: 12px; color: #999999;">
                                    Mimikree<br>
                                    c/o Sahil Chordia<br>
                                    8125 46th Ave<br>
                                    College Park, MD, USA 20740
                                </div>
                                
                                <!-- Unsubscribe link -->
                                <div style="margin-top: 20px; font-size: 12px; color: #999999;">
                                    <p>This message was sent to ${user.email}. If you don't want to receive emails from Mimikree in the future, <a href="https://www.mimikree.com/unsubscribe?email=${encodeURIComponent(user.email)}" style="color: #4d68ff; text-decoration: underline;">unsubscribe here</a>.</p>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
};

// Generate a plain text version for better deliverability
const getPlainTextVersion = (user) => {
    return `
Welcome to Mimikree, ${user.name || "there"}!

We're excited that you've joined our community! Your account has been successfully created, and you're now just a few steps away from creating your own AI replica.

Fun Fact: If your digital twin and a toaster had a conversation, your twin would probably win... unless you really love discussing bread temperatures.

Here's how to get started:

1. COMPLETE YOUR PROFILE: Add your social media profiles, upload PDFs, and images that represent your personality and knowledge base.

2. FILL OUT SELF-ASSESSMENT: Tell us about your communication style, interests, and personality traits to make your digital twin even more accurate.

3. CHAT WITH YOUR TWIN: Start a conversation with your AI replica and see how accurately it mimics your style and knowledge!

The more information you provide, the more accurate your AI twin will be. Don't worry - all your data is private and secure!

Complete your profile now: https://www.mimikree.com/add-data

YOUR FEEDBACK MATTERS
As a solo developer, I value your input to help improve Mimikree.
Share your thoughts: https://forms.gle/yhypwtSjn62W4bUF8

Feel free to reply to this email if you have any questions - I'm here to help!

© 2025 Mimikree. All rights reserved.
`;
};

// Generate iCal calendar invite to improve deliverability and engagement
const getWelcomeCalendarEvent = (user) => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1); // Tomorrow
    startTime.setHours(10, 0, 0, 0); // 10:00 AM
    
    const endTime = new Date(startTime);
    endTime.setHours(10, 30, 0, 0); // 10:30 AM
    
    return `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:REQUEST
PRODID:-//Mimikree//welcome//EN
BEGIN:VEVENT
DTSTART:${formatICalDate(startTime)}
DTEND:${formatICalDate(endTime)}
DTSTAMP:${formatICalDate(new Date())}
ORGANIZER;CN=Mimikree:mailto:${EMAIL_USER}
UID:welcome-${Date.now()}-${user.username}@mimikree.com
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${user.name || "Mimikree User"};RSVP=TRUE:mailto:${user.email}
SUMMARY:Set up your Mimikree Digital Twin
DESCRIPTION:This is a reminder to complete your Mimikree profile and start chatting with your digital twin\\nVisit https://www.mimikree.com/add-data to get started!
LOCATION:https://www.mimikree.com/add-data
SEQUENCE:0
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;
};

// Helper function to format dates for iCal
const formatICalDate = (date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

// Test email delivery
const testEmailDelivery = async (testEmail) => {
    try {
        console.log(`Starting email delivery test to ${testEmail}`);
        const transporter = await createTransporter();
        
        // Create a unique email ID
        const emailId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const domain = EMAIL_USER.split('@')[1];
        
        // HTML with table-based layout and all styles inline
        const htmlContent = `
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Email Delivery Test</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333333; background-color: #f5f7ff;">
            <!-- Main Table -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f5f7ff">
                <tr>
                    <td style="padding: 40px 0;">
                        <!-- Content Table -->
                        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);">
                            <!-- Header -->
                            <tr>
                                <td align="center" style="padding: 30px 0; background: linear-gradient(135deg, #4d68ff, #ff5c7d); border-radius: 8px 8px 0 0;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Email Delivery Test</h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px 30px;">
                                    <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px;">This is a test email to verify delivery and styling.</p>
                                    
                                    <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px;">If you're seeing this with proper styling (colors, formatting, etc.), it means your email configuration is working correctly.</p>
                                    
                                    <!-- Highlight Box -->
                                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #e7f7ee; border-left: 4px solid #6fcf97; border-radius: 4px; margin-bottom: 30px;">
                                        <tr>
                                            <td style="padding: 15px;">
                                                <h3 style="color: #27ae60; margin-top: 0; margin-bottom: 10px; font-weight: 600;">Success Indicators</h3>
                                                <ul style="margin: 0; padding-left: 20px;">
                                                    <li style="margin-bottom: 5px;">This box should have a green border on the left</li>
                                                    <li style="margin-bottom: 5px;">Text should be properly formatted with spacing</li>
                                                    <li style="margin-bottom: 5px;">This email should have arrived in your inbox (not spam)</li>
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px;">Current timestamp: <span style="color: #4d68ff; font-weight: 600;">${new Date().toISOString()}</span></p>
                                    
                                    <!-- Button -->
                                    <table border="0" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                                        <tr>
                                            <td bgcolor="#4d68ff" style="padding: 12px 30px; border-radius: 50px; text-align: center;">
                                                <a href="https://www.mimikree.com" style="color: #ffffff; text-decoration: none; font-weight: 600; display: inline-block;">Visit Mimikree</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px 30px; background-color: #f8f9fa; border-top: 1px solid #eeeeee; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #999999;">
                                    <p style="margin-top: 0; margin-bottom: 10px;">This is an automated test message. Please do not reply.</p>
                                    <p style="margin-top: 0; margin-bottom: 0;">© 2025 Mimikree. All rights reserved.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `;
        
        // No need to use juice here since we've manually inlined all styles
        
        const mailOptions = {
            from: EMAIL_FROM,
            to: testEmail,
            subject: "Mimikree Email Delivery Test",
            html: htmlContent,
            // Plain text version is important for deliverability
            text: `
Email Delivery Test

This is a test email to verify delivery and styling.
If you're seeing this properly, it means your email configuration is working correctly.
Current timestamp: ${new Date().toISOString()}

This is an automated test message. Please do not reply.
            `,
            headers: {
                // Anti-spam compliance headers
                'List-Unsubscribe': '<mailto:' + EMAIL_USER + '?subject=unsubscribe>',
                'Feedback-ID': `test:mimikree:${emailId}:${domain}`,
                'Precedence': 'bulk'
            },
            messageId: `<${emailId}@${domain}>`
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log(`Test email sent to ${testEmail}. Message ID: ${info.messageId}`);
        return {
            success: true,
            messageId: info.messageId,
            response: info.response
        };
    } catch (error) {
        console.error(`Failed to send test email to ${testEmail}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    sendWelcomeEmail,
    getWelcomeEmailTemplate,
    testEmailDelivery
}; 