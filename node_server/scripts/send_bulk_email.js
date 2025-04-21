const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config(); // Adjust path if your .env is elsewhere

// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI;
const EMAIL_HOST = process.env.EMAIL_HOST; // e.g., 'smtp.gmail.com'
const EMAIL_PORT = process.env.EMAIL_PORT || 587; // e.g., 587 for TLS
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true'; // true for 465, false for other ports
const EMAIL_USER = process.env.EMAIL_USER; // Your email address
const EMAIL_PASS = process.env.EMAIL_PASS; // Your email password or app-specific password
const EMAIL_FROM = process.env.EMAIL_FROM || `"Mimikree" <${EMAIL_USER}>`; // Sender address

// --- User Schema (Simplified - copy or require your full schema if needed) ---
// Make sure this matches the structure in server.js, especially the 'email' field
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true }
    // Include other fields if you need them for personalization
    // name: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// --- Main Function ---
async function sendBulkEmail() {
    if (!MONGO_URI || !EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
        console.error('Error: Missing required environment variables (MONGO_URI, EMAIL_HOST, EMAIL_USER, EMAIL_PASS).');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 15000,
            maxPoolSize: 10,
            retryWrites: true,
            w: 'majority'
        });
        console.log('Connected to MongoDB.');

        console.log('Fetching users...');
        const users = await User.find({}, 'email name'); // Fetch only email and name (optional)
        console.log(`Found ${users.length} users.`);

        if (users.length === 0) {
            console.log('No users found to email.');
            return;
        }

        console.log('Setting up email transporter...');
        const transporter = nodemailer.createTransport({
            host: EMAIL_HOST,
            port: EMAIL_PORT,
            secure: EMAIL_SECURE, // Use true for port 465, false for others (like 587 with STARTTLS)
            auth: {
                user: EMAIL_USER,
                pass: EMAIL_PASS,
            },
            // Consider adding TLS options if needed, e.g., for self-signed certs
            // tls: {
            //     rejectUnauthorized: false
            // }
        });

        console.log('Verifying transporter configuration...');
        await transporter.verify(); // Check if the connection is valid
        console.log('Transporter verified successfully.');

        console.log('Starting email sending process...');
        let successCount = 0;
        let failureCount = 0;

        // --- Customize Email Content Here ---
        const emailSubject = "🎉 Hold onto your keyboards! Mimikree just got a major glow-up! 🚀";
        const getEmailHtml = (user) => `
            <p>Hello ${user.name || 'Mimikree User'},</p>

            <p>I am excited to announce some major updates to Mimikree (<a href="https://www.mimikree.com">www.mimikree.com</a>) designed to enhance your personalized AI experience!</p>

            <h2>What's New?</h2>
            <ul>
                <li><strong>Leaderboards:</strong> See how different user models rank based on engagement and data completeness! Check it out on the main page.</li>
                <li><strong>Chat History:</strong> Your conversations with your Mimikree model are now saved, so you can pick up right where you left off.</li>
                <li><strong>Enhanced UI:</strong> I have polished the user interface for a smoother and more intuitive experience.</li>
            </ul>

            <p>Log in now to explore these new features!</p>

            <h2>We Value Your Feedback!</h2>
            <p>Your thoughts help me make Mimikree even better. Please take a moment to share your experience by filling out quick feedback form:</p>
            <p><a href="https://docs.google.com/forms/d/e/1FAIpQLSf5mAJDd-1BjWd6lO7xC_Tbl41kmU2-_i_e08HcyjP6KtjH5w/viewform?usp=header" target="_blank">Give Feedback Here</a></p>

            <p>Thank you for being part of the Mimikree community!</p>

            <p>Best regards,</p>
            <p><em>Sahil Chordia</em></p>
        `;
        // --- End Email Content ---

        for (const user of users) {
            if (!user.email) {
                console.warn(`Skipping user with missing email: ${user._id}`);
                failureCount++;
                continue;
            }

            const mailOptions = {
                from: EMAIL_FROM,
                to: user.email,
                subject: emailSubject,
                // text: 'Plain text version of the email', // Optional plain text version
                html: getEmailHtml(user),
            };

            try {
                // Consider adding a delay between sends to avoid rate limits
                // await new Promise(resolve => setTimeout(resolve, 500)); // e.g., 500ms delay

                console.log(`Sending email to ${user.email}...`);
                await transporter.sendMail(mailOptions);
                console.log(`Email sent successfully to ${user.email}`);
                successCount++;
            } catch (error) {
                console.error(`Failed to send email to ${user.email}:`, error);
                failureCount++;
                // Decide if you want to stop on error or continue
                // process.exit(1);
            }
        }

        console.log('--- Email Sending Summary ---');
        console.log(`Successfully sent: ${successCount}`);
        console.log(`Failed to send: ${failureCount}`);
        console.log('-----------------------------');

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        console.log('Disconnecting from MongoDB...');
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

// --- Run the script ---
sendBulkEmail(); 