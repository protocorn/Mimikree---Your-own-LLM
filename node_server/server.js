const express = require("express");
const cors = require("cors");
const helmet = require("helmet");  // Security headers
const { body, validationResult } = require('express-validator'); // Input validation
const xss = require('xss'); // XSS protection
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");  // Import the pdf-parse library
const axios = require("axios");
const githubRoutes = require("./src/github");
const twitterRoutes = require("./src/twitter");
const linkedinRoutes = require("./src/linkedin");
const mediumRoutes = require("./src/medium");
const redditRoutes = require("./src/reddit");
const calendarRoutes = require("./src/calendar");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;
// Import email service
const { sendWelcomeEmail, getWelcomeEmailTemplate, testEmailDelivery } = require('./utils/emailService');
// Import rate limiting middleware
const rateLimit = require('express-rate-limit');


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware - helmet for security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://cdnjs.cloudflare.com", 
                "https://fonts.googleapis.com", 
                "https://unpkg.com",
                "https://cdn.jsdelivr.net"
            ],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "'unsafe-eval'", // Needed for some JavaScript libraries
                "https://cdnjs.cloudflare.com", 
                "https://unpkg.com", 
                "https://cdn.jsdelivr.net", // Allow jsdelivr CDN
                "https://www.youtube.com", 
                "https://youtube.com"
            ],
            fontSrc: [
                "'self'", 
                "https://fonts.gstatic.com", 
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net"
            ],
            imgSrc: [
                "'self'", 
                "data:", 
                "https:", 
                "http:", 
                "https://img.youtube.com", 
                "https://i.ytimg.com"
            ],
            connectSrc: ["'self'", "https:", "http:"],
            frameSrc: [
                "'self'", 
                "https://www.youtube.com", 
                "https://youtube.com", 
                "https://www.youtube-nocookie.com"
            ],
            frameAncestors: ["*"], // Allow embedding in iframes on any domain
            mediaSrc: [
                "'self'", 
                "https:", 
                "http:", 
                "data:", 
                "blob:", 
                "https://www.youtube.com", 
                "https://youtube.com"
            ],
            childSrc: [
                "'self'", 
                "https://www.youtube.com", 
                "https://youtube.com"
            ],
            objectSrc: ["'none'"], // Prevent object/embed for security
            baseUri: ["'self'"], // Restrict base URIs
        },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for iframe functionality
}));

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
    const sanitizeField = (obj, field) => {
        if (obj[field] && typeof obj[field] === 'string') {
            obj[field] = xss(obj[field].trim());
        }
    };

    // Sanitize common fields
    if (req.body) {
        ['query', 'username', 'email', 'name', 'title', 'content', 'message'].forEach(field => {
            sanitizeField(req.body, field);
        });
    }
    
    next();
};

app.use(sanitizeInput);

// Validation error handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

// Configure rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { message: "Too many login attempts, please try again later" }
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 signups per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many signup attempts, please try again later" }
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests, please try again later" }
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Add Hugging Face API configuration
const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;
const HUGGING_FACE_API_URL = process.env.HUGGING_FACE_API_URL;

// MongoDB Connection Config - centralized to avoid duplication
const MONGO_CONNECTION_OPTIONS = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 15000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority'
};

// MongoDB Connection Setup
mongoose.connect(process.env.MONGO_URI, MONGO_CONNECTION_OPTIONS)
.then(() => {
    console.log("Connected to MongoDB");
    // Start the server only after successful MongoDB connection
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})
.catch((err) => {
    console.error("Initial MongoDB connection error:", err);
    // Attempt to reconnect after a delay
    setTimeout(() => {
        mongoose.connect(process.env.MONGO_URI, MONGO_CONNECTION_OPTIONS)
        .then(() => console.log("Reconnected to MongoDB"))
        .catch((reconnectErr) => console.error("Failed to reconnect:", reconnectErr));
    }, 5000);
});

// Middleware
app.use(express.json({ limit: '10mb' })); // Reduced from 50MB for security
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Secure CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? [process.env.FRONTEND_URL, 'https://mimikree.com', 'https://www.mimikree.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use((req, res, next) => {
    if (req.path.includes('/wp-admin') || req.path.includes('/setup-config.php')) {
        return res.status(403).send('Access Denied');
    }
    next();
});

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// API routes
app.use("/api/github", githubRoutes.router);
app.use("/api/twitter", twitterRoutes.router);
app.use("/api/linkedin", linkedinRoutes.router);
app.use("/api/medium", mediumRoutes.router);
app.use("/api/reddit", redditRoutes.router);
app.use("/api/calendar", calendarRoutes.router);

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    timezone: { 
        offset: { type: Number, required: false },  // Timezone offset in minutes
        name: { type: String, required: false }     // Timezone name (e.g., "America/New_York")
    },
    socialProfiles: {
        github: { type: String, required: false },
        linkedin: { type: String, required: false },
        twitter: { type: String, required: false },
        medium: { type: String, required: false },
        reddit: { type: String, required: false }
    },
    selfAssessment: {
        communicationStyle: { type: String, required: false },
        personalityTraits: [{ type: String }],
        writingSample: { type: String, required: false },
        interests: [{ type: String }]
    },
    pdfs: [String],
    images: [{ url: String, description: String }],
    ratings: [{
        rater: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rating: { type: Number, min: 1, max: 5 }
    }]
});

const User = mongoose.model('User', userSchema);

// Chat Schema
const chatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: function() {
        // Default title is the creation date
        return new Date().toLocaleDateString();
    }},
    messages: [{
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    metadata: {
        expandedQueries: [String],
        queryComplexity: [Number],
        documentsRetrieved: [Number]
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Add index for faster retrieval of chats by userId
chatSchema.index({ userId: 1, createdAt: -1 });

const Chat = mongoose.model('Chat', chatSchema);

// JWT Secret Key from environment variables
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const envd = process.env.NODE_ENV || "production"; // Default to production
const config = require("./config")[envd];

app.get('/add-data', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "data.html"));
});

app.get('/signup', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "signup.html"));
});

app.get('/login', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get('/privacy-policy', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

// New route to serve the leaderboard page
app.get('/leaderboard', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "leaderboard.html"));
});

// Preview welcome email route
app.get('/preview-welcome-email', async (req, res) => {
    const user = {
        name: req.query.name || 'Test User',
        email: req.query.email || 'test@example.com',
        username: req.query.username || 'testuser'
    };

    const html = getWelcomeEmailTemplate(user);
    // No need to use juice since we've manually inlined all styles
    res.send(html);
});

app.get('/email-preview', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/email-preview.html'));
});

// API endpoint to fetch leaderboard data
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Fetch all users with their ratings and other relevant data
        const users = await User.find({}, {
            name: 1,
            username: 1,
            ratings: 1,
            socialProfiles: 1,
            pdfs: 1,
            images: 1,
            selfAssessment: 1
        });

        // Process users to calculate enhanced credibility scores
        const models = users.map(user => {
            let averageRating = 0;
            const ratingCount = user.ratings ? user.ratings.length : 0;
            
            if (ratingCount > 0) {
                const totalRating = user.ratings.reduce((sum, rating) => sum + rating.rating, 0);
                averageRating = totalRating / ratingCount;
            }
            
            // Calculate base credibility score: average rating × number of ratings
            let credibilityScore = averageRating * ratingCount;
            
            // Calculate data completeness score
            const dataCompletenessScore = calculateDataCompletenessScore(user);
            
            // Final credibility score combines rating-based score and data completeness
            const finalCredibilityScore = credibilityScore + dataCompletenessScore;
            
            return {
                name: user.name,
                username: user.username,
                averageRating: averageRating,
                ratingCount: ratingCount,
                dataCompletenessScore: dataCompletenessScore,
                credibilityScore: finalCredibilityScore
            };
        });
        
        // Sort models by enhanced credibility score (highest first)
        models.sort((a, b) => b.credibilityScore - a.credibilityScore);
        
        res.json({ 
            success: true,
            models: models
        });
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch leaderboard data'
        });
    }
});

// Helper function to calculate data completeness score
function calculateDataCompletenessScore(user) {
    let score = 0;
    
    // Social profiles: up to 10 points (2 points per connected profile)
    if (user.socialProfiles) {
        if (user.socialProfiles.github) score += 2;
        if (user.socialProfiles.linkedin) score += 2;
        if (user.socialProfiles.twitter) score += 2;
        if (user.socialProfiles.medium) score += 2;
        if (user.socialProfiles.reddit) score += 2;
    }
    
    // PDFs: up to 5 points (1 point per PDF, max 5)
    if (user.pdfs && user.pdfs.length) {
        score += Math.min(user.pdfs.length, 5);
    }
    
    // Images: up to 5 points (0.5 points per image, max 5)
    if (user.images && user.images.length) {
        score += Math.min(user.images.length * 0.5, 5);
    }
    
    // Self Assessment: up to 5 points
    if (user.selfAssessment) {
        if (user.selfAssessment.communicationStyle) score += 1;
        if (user.selfAssessment.personalityTraits && user.selfAssessment.personalityTraits.length > 0) score += 1;
        if (user.selfAssessment.writingSample) score += 2;
        if (user.selfAssessment.interests && user.selfAssessment.interests.length > 0) score += 1;
    }
    
    return score;
}

// Add findUserByUsername helper function after authenticateToken middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: "Authentication required" });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: "Invalid or expired token" });
    }
};

// Helper function to find user by username and handle common error cases
const findUserByUsername = async (username, res) => {
    try {
        const user = await User.findOne({ username });
        if (!user) {
            res.status(404).json({ success: false, message: "User not found" });
            return null;
        }
        return user;
    } catch (error) {
        console.error("Database error fetching user:", error);
        res.status(500).json({ success: false, message: "Database error" });
        return null;
    }
};

// Replace the API endpoint to rate a user's model with this refactored version
app.post('/api/rate-model', authenticateToken, async (req, res) => {
    try {
        const raterId = req.user.userId;
        const { username, rating } = req.body;
        
        if (!username || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid rating data. Rating must be between 1-5.'
            });
        }

        // Find the user to be rated
        const userToRate = await findUserByUsername(username, res);
        if (!userToRate) return;

        // Prevent users from rating themselves
        if (userToRate._id.toString() === raterId) {
            return res.status(400).json({ 
                success: false, 
                error: 'You cannot rate your own model'
            });
        }

        // Check if user has already rated this model
        const existingRatingIndex = userToRate.ratings.findIndex(
            r => r.rater.toString() === raterId
        );

        if (existingRatingIndex >= 0) {
            // Update existing rating
            userToRate.ratings[existingRatingIndex].rating = rating;
        } else {
            // Add new rating
            userToRate.ratings.push({
                rater: raterId,
                rating: rating
            });
        }

        await userToRate.save();

        // Calculate new average rating
        const totalRating = userToRate.ratings.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = userToRate.ratings.length > 0 ? 
            totalRating / userToRate.ratings.length : 0;

        res.json({ 
            success: true, 
            message: 'Rating submitted successfully',
            newRating: {
                average: averageRating,
                count: userToRate.ratings.length
            }
        });
    } catch (error) {
        console.error('Error rating model:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to submit rating'
        });
    }
});

// Route to handle form submission
app.post("/api/submit", async (req, res) => {
    try {
        const data = req.body;
        console.log("Received Data:", data);

        const collectedData = {};
        let combinedText = "";
        let documents = [];

        // Collect GitHub data
        if (data.socialProfiles.github) {
            const githubResponse = await axios.post(`${config.nodeServer}/api/github/profile`, {
                username: data.socialProfiles.github.username
            });
            collectedData.github = githubResponse.data;
            if (githubResponse.data.repositories) {
                githubResponse.data.repositories.forEach(repo => {
                    documents.push(`Repository Name: ${repo.name} - Readme.md: ${repo.readme}`);
                });
            }

            documents.push(JSON.stringify(githubResponse.data.profile))

            combinedText += `GitHub Profile: ${JSON.stringify(collectedData.github)} `;
        }

        if (data.socialProfiles.linkedin) {
            const linkedinResponse = await axios.post(`${config.nodeServer}/api/linkedin/profile`, {
                linkedInUrl: data.socialProfiles.linkedin.url
            });

            collectedData.linkedin = linkedinResponse.data.profile;

            // Store LinkedIn data in Pinecone
            documents.push(JSON.stringify(linkedinResponse.data.profile));

            combinedText += `LinkedIn Profile: ${JSON.stringify(collectedData.linkedin)} `;
        }
        // Collect Twitter data
        if (data.socialProfiles.twitter) {
            const twitterResponse = await axios.post(`${config.nodeServer}/api/twitter/profile`, {
                username: data.socialProfiles.twitter.username
            });
            collectedData.twitter = twitterResponse.data;
            documents.push(JSON.stringify(collectedData.twitter));
        }

        if (data.socialProfiles.medium) {
            const mediumResponse = await axios.post(`${config.nodeServer}/api/medium/profile`, {
                username: data.socialProfiles.medium.username
            });
            collectedData.medium = mediumResponse.data;
            mediumResponse.data.articles.forEach(article => {
                documents.push(JSON.stringify(`Medium Aricle \n Title: ${article.title} \n Link: ${article.link} \n Content: ${article.content}`));
            })
        }
        if (data.socialProfiles.reddit) {
            const redditResponse = await axios.post(`${config.nodeServer}/api/reddit/profile`, {
                username: data.socialProfiles.reddit.username
            });
            collectedData.reddit = redditResponse.data;
            redditResponse.data.posts.forEach(post => {
                documents.push(JSON.stringify(`Reddit Post \n Title: ${post.title} \n Link: ${post.url} \n Content: ${post.content}`));
            })
        }

        if (data.pdfs) {
            collectedData.pdfs = data.pdfs;
            data.pdfs.forEach(pdf => {
                documents.push(JSON.stringify(`PDF Name: ${pdf.filename} \n PDF Content: ${pdf.text}`));
            })

        }

        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET_KEY);
                const username = decoded.username;

                for (const doc of documents) {
                    await axios.post(`${config.llamaServer}/process`, { document: doc, username: username });
                }

                if (data.socialProfiles.github) {
                    await updateUserSocialMediaProfile(username, data.socialProfiles.github.username, "github");
                }

                if (data.socialProfiles.linkedin) {
                    await updateUserSocialMediaProfile(username, data.socialProfiles.linkedin.url, "linkedin");
                }

                if (data.socialProfiles.twitter) {
                    await updateUserSocialMediaProfile(username, data.socialProfiles.twitter.username, "twitter");
                }
                if (data.socialProfiles.medium) {
                    await updateUserSocialMediaProfile(username, data.socialProfiles.medium.username, "medium");
                }
                if (data.selfAssessment) {
                    console.log("Received self-assessment data:", data.selfAssessment);
                    try {
                        await updateUserSelfAssessment(username, data.selfAssessment);
                        console.log(`Updated self-assessment for user: ${username}`);
                    } catch (error) {
                        console.error("Error updating self-assessment:", error);
                    }
                }
                if (data.pdfs) {
                    try {
                        collectedData.pdfs = data.pdfs.map(pdf => pdf.filename); // Extract filenames
                        for (const pdf of data.pdfs) {
                            await updatePDFs(username, pdf.filename); // Use extracted filename
                        }
                        console.log(`Updated pdfs for user: ${username}`);
                    } catch (error) {
                        console.error("Error updating pdfs:", error);
                    }
                }
                if (data.images && data.images.length > 0) {
                    for (const image of data.images) {
                        try {
                            // Upload image to cloudinary
                            const result = await cloudinary.uploader.upload(image.src, {
                                public_id: `user_${username}_${Date.now()}`,
                            });
                            const imageUrl = result.secure_url;
                            
                            // Update user's image collection
                            const updateResult = await updateUserImages(username, imageUrl, image.description);
                            if (!updateResult.success) {
                                console.error("Failed to update user's images:", updateResult.message);
                                continue; // Skip to next image instead of failing entirely
                            }
                            
                            // Process the image for the AI model
                            try {
                                await axios.post(`${config.llamaServer}/process`, { 
                                    document: `Image Analysis:
URL: ${imageUrl}
AI Generated Caption: ${image.caption || ''}
User Description: ${image.description || ''}`, 
                                    username: username 
                                });
                                console.log(`Image uploaded and processed: ${imageUrl}`);
                            } catch (processingError) {
                                console.error("Error processing image for AI:", processingError.message);
                                // Continue with other images since the upload and user update was successful
                            }
                        } catch (uploadError) {
                            console.error("Error uploading image:", uploadError.message);
                            // Continue with next image
                        }
                    }
                }
            }
            catch (error) {
                console.error(error);
                return res.status(401).json({ success: false, message: error });
            }
        }
        else {
            return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
        }

        res.json({ success: true, message: "Data sent successfully" });

    } catch (error) {
        console.error("Error in /api/submit:", error); // Log the full error object
        if (error.response) { // Check for error from external API calls
            console.error("API Error Response:", error.response.data); // Log API error details
            console.error("API Error Status:", error.response.status); // Log API error status
            res.status(error.response.status || 500).json({ success: false, message: `API Error: ${error.response.data.message || "An error occurred"}` }); // Send API error to client
        } else if (error.message) { // Check if it is a normal error
            res.status(500).json({ success: false, message: error.message }); // Send normal error to the client
        } else {
            res.status(500).json({ success: false, message: "Server error" }); // Send generic error to the client
        }
    }
});

// Refactor image upload handling to standardize error handling and cleanup
async function updateUserImages(username, imageUrl, imageDescription) {
    try {
        const user = await User.findOne({ username: username });
        if (!user) {
            console.log(`User not found: ${username}`);
            return { success: false, message: "User not found" };
        }

        if (!user.images) {
            user.images = [];
        }

        user.images.push({ url: imageUrl, description: imageDescription });
        await user.save();

        console.log(`Image URL added for user: ${username}`);
        return { success: true };
    } catch (error) {
        console.error("Error updating images:", error);
        return { success: false, message: error.message };
    }
}

async function generateImageCaption(imageUrl) {
    try {
        // Replace with your actual AI captioning logic
        // This is just an example using a hypothetical captioning service
        const response = await axios.post(`${config.llamaServer}/caption`, { image_url: imageUrl });
        return response.data.caption;
    } catch (error) {
        console.error("Error generating caption:", error);
        return "No caption available"; // Or handle the error as you prefer
    }
}

async function updateUserSelfAssessment(username, selfAssessmentData) {
    try {
        await User.updateOne(
            { username: username },
            { $set: { selfAssessment: selfAssessmentData } }
        );
        console.log(`Updated self-assessment for user: ${username}`);
    } catch (error) {
        console.error("Error updating self-assessment:", error);
    }
}

async function updatePDFs(username, pdfFilename) { // Renamed for clarity
    try {
        await User.updateOne(
            { username: username },
            { $push: { pdfs: pdfFilename } } // Use $push to add to the array
        );
        console.log(`Added PDF ${pdfFilename} for user: ${username}`); // More accurate log
    } catch (error) {
        console.error("Error updating pdfs:", error);
    }
}

async function updateUserSocialMediaProfile(userId, profileData, platform) {
    try {
        const user = await User.findOne({ username: userId });

        if (!user) {
            console.log(`User not found for ${platform}: ${profileData}`);
            return;
        }

        // Correctly update the specific social media field
        await User.updateOne(
            { username: userId },
            { $set: { [`socialProfiles.${platform}`]: profileData } }
        );

        console.log(`Updated ${platform} profile for user ID: ${userId}`);
    } catch (error) {
        console.error("Error updating social media profile:", error);
    }
}

app.get("/", async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
})

app.get("/query/:username", async (req, res) => {
    const username = req.params.username;

    if (!username) {
        return res.status(400).send("Username is required");
    }

    try {
        const user = await User.findOne({ username: username });

        if (!user) {
            return res.status(404).send("User not found");
        }

        res.sendFile(path.join(__dirname, "public", "query.html"));
    } catch (error) {
        console.error("Error checking user:", error);
        res.status(500).send("Server error");
    }
});

// Helper function to check calendar availability
async function checkCalendarAvailability(username, date) {
    try {
        const response = await fetch(`${config.nodeServer}/api/calendar/busy-blocks/${username}?date=${date}`);
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Error checking calendar availability:', error);
        return null;
    }
}

// Modify the query endpoint to include calendar information
app.post('/api/query/:username', apiLimiter, async (req, res) => {
    try {
        const { query, chatHistory, memory_enabled } = req.body;
        const { username } = req.params;

        // Initialize or get existing chat history
        const updatedHistory = chatHistory ? [...chatHistory] : [];

        // Get user's timezone information
        const user = await User.findOne({ username: username });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Create date in user's timezone
        const userDate = new Date();
        const userTimezone = user.timezone?.name || 'UTC';

        // Add current date context to every query
        const dateContext = {
            role: "system",
            content: `Current date and time in user's timezone (${userTimezone}): ${userDate.toLocaleString('en-US', { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short',
                timeZone: userTimezone,  // Explicitly use the user's timezone
                hour12: true  // Use 12-hour format
            })}`
        };
        updatedHistory.push(dateContext);

        // Check if query is related to calendar/scheduling
        const schedulingKeywords = ['free', 'available', 'schedule', 'meeting', 'calendar', 'tomorrow', 'today', 'week', 'month', 'friday', 'monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'];
        const isSchedulingQuery = schedulingKeywords.some(keyword => 
            query.toLowerCase().includes(keyword)
        );

        let calendarInfo = '';
        if (isSchedulingQuery) {
            // Extract date from query or use tomorrow's date
            let queryDate = new Date(userDate);
            let endDate = new Date(userDate);
            let dateRange = [];

            // Handle different date queries
            if (query.toLowerCase().includes('tomorrow')) {
                queryDate.setDate(queryDate.getDate() + 1);
                endDate = new Date(queryDate);
            } else if (query.toLowerCase().includes('this week')) {
                // Get the current day of week (0 = Sunday, 1 = Monday, etc.)
                const currentDay = queryDate.getDay();
                // Calculate days until Saturday
                const daysUntilSaturday = 6 - currentDay;
                endDate.setDate(queryDate.getDate() + daysUntilSaturday);
            } else if (query.toLowerCase().includes('next week')) {
                // Get to next Monday
                const currentDay = queryDate.getDay();
                const daysUntilNextMonday = (8 - currentDay) % 7;
                queryDate.setDate(queryDate.getDate() + daysUntilNextMonday);
                // Set end date to next Sunday
                endDate = new Date(queryDate);
                endDate.setDate(endDate.getDate() + 6);
            } else if (query.toLowerCase().includes('this month')) {
                // Get to the last day of current month
                endDate = new Date(queryDate.getFullYear(), queryDate.getMonth() + 1, 0);
            } else if (query.toLowerCase().includes('next month')) {
                // Get to first day of next month
                queryDate = new Date(queryDate.getFullYear(), queryDate.getMonth() + 1, 1);
                // Get to last day of next month
                endDate = new Date(queryDate.getFullYear(), queryDate.getMonth() + 1, 0);
            } else {
                // Handle specific day queries (e.g., "this friday", "next monday")
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const targetDay = days.find(day => query.toLowerCase().includes(day));
                if (targetDay) {
                    const currentDay = queryDate.getDay();
                    const targetDayIndex = days.indexOf(targetDay);
                    let daysToAdd = targetDayIndex - currentDay;
                    
                    // If the target day is before current day, add 7 to get to next occurrence
                    if (daysToAdd <= 0) {
                        daysToAdd += 7;
                    }
                    
                    // If query includes "next", add another week
                    if (query.toLowerCase().includes('next')) {
                        daysToAdd += 7;
                    }
                    
                    queryDate.setDate(queryDate.getDate() + daysToAdd);
                    endDate = new Date(queryDate);
                }
            }

            // Generate array of dates between start and end date
            while (queryDate <= endDate) {
                dateRange.push(new Date(queryDate));
                queryDate.setDate(queryDate.getDate() + 1);
            }

            // Check availability for each date in the range
            let allAvailability = [];
            for (const date of dateRange) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const formattedDate = `${year}-${month}-${day}`;
                
                const availability = await checkCalendarAvailability(username, formattedDate);
                if (availability) {
                    if (availability.busyBlocks && availability.busyBlocks.length > 0) {
                        allAvailability.push({
                            date: formattedDate,
                            blocks: availability.busyBlocks
                        });
                    }
                }
            }

            // Format the calendar information
            if (allAvailability.length > 0) {
                const blocks = allAvailability.map(day => 
                    `\n${day.date}:\n${day.blocks.map(block => 
                        `- Busy from ${block.startTime} to ${block.endTime}`
                    ).join('\n')}`
                ).join('\n');
                calendarInfo = `\nCalendar information for the requested period:\n${blocks}`;
            } else {
                calendarInfo = `\nNo scheduled events found for the requested period.`;
            }
        }

        // Add calendar information if available
        if (calendarInfo) {
            updatedHistory.push({
                role: "system",
                content: `Calendar availability information: ${calendarInfo}`
            });
        }

        // Rest of your existing query handling code...
        // Make sure to pass updatedHistory instead of chatHistory to your model

        let myusername;
        let is_own_model = false;
        const token = req.headers.authorization?.split(" ")[1];
        let decoded = null;
        
        if (token) {
            try {
                decoded = jwt.verify(token, JWT_SECRET_KEY);
                myusername = decoded.username;
                if(username==myusername){
                    is_own_model=true;
                }
            }
            catch (error){
                console.log(error);
            }
        }

        // Input Validation
        if (!query || query.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Query cannot be empty" });
        }

        if (!username || username.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Username cannot be empty" });
        }

        // 3. Data Retrieval
        try {
            const user = await User.findOne({ username: username });
            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            if (!user.selfAssessment) {  // Check if selfAssessment exists
                return res.status(404).json({ success: false, message: "User self-assessment data not found" });
            }

            const dataForModel = {
                query: query,
                selfAssessment: user.selfAssessment,
                username: username,
                name: user.name, // Include name if needed by your LLM
                own_model: is_own_model,
                chatHistory: updatedHistory,  // Include updated chat history in the request to LLama server
                memory_enabled: memory_enabled && is_own_model // Only enable memory for user's own model
            };

            const response = await axios.post(`${config.llamaServer}/ask`, dataForModel);

            // 6. Response Handling
            if (!response.data || !response.data.response) { // Check for valid response structure
                console.error("Invalid response from LLM:", response.data);
                return res.status(500).json({ success: false, message: "Invalid response from model" });
            }

            // Only store chat if user is chatting with their own model
            let chatId = req.body.chatId;
            
            // Create response object
            const responseData = {
                success: true,
                response: response.data.response,
                memory_confirmation_needed: response.data.memory_confirmation_needed || false,
                memory_data: response.data.memory_data || null
            };
            
            // Only store chats if user is talking to their own model
            if (is_own_model) {
                try {
                    let chat;
                    if (chatId) {
                        // Update existing chat
                        chat = await Chat.findById(chatId);
                        if (!chat) {
                            // If chat ID is invalid, create a new one
                            chat = new Chat({
                                userId: user._id,
                                title: query.substring(0, 30) + '...',
                                messages: []
                            });
                        }
                    } else {
                        // Create new chat
                        chat = new Chat({
                            userId: user._id,
                            title: query.substring(0, 30) + '...',
                            messages: []
                        });
                    }

                    // Add user message
                    chat.messages.push({
                        role: 'user',
                        content: query
                    });

                    // Add assistant message
                    chat.messages.push({
                        role: 'assistant',
                        content: response.data.response
                    });

                    // Update title for new chats
                    if (!chatId) {
                        chat.title = query.substring(0, 30) + (query.length > 30 ? '...' : '');
                    }
                    
                    // Always update title if it's still "New Chat" regardless of chatId
                    if (chat.title === 'New Chat') {
                        chat.title = query.substring(0, 30) + (query.length > 30 ? '...' : '');
                    }

                    // Update chat metadata
                    chat.metadata = {
                        ...chat.metadata,
                        expandedQueries: [...(chat.metadata?.expandedQueries || []), response.data.expandedQuery],
                        queryComplexity: [...(chat.metadata?.queryComplexity || []), response.data.queryComplexity],
                        documentsRetrieved: [...(chat.metadata?.documentsRetrieved || []), response.data.documentsRetrieved]
                    };

                    // Update timestamp
                    chat.updatedAt = Date.now();

                    // Save to database
                    await chat.save();
                    
                    // Add chat ID and title to response
                    responseData.chatId = chat._id;
                    responseData.chatTitle = chat.title;
                    
                    console.log(`Saved chat for user ${username} (own model)`);
                } catch (error) {
                    console.error("Error saving chat:", error);
                    // Continue even if chat saving fails
                }
            } else {
                console.log(`Chat not saved - user ${myusername || 'anonymous'} is viewing ${username}'s model`);
            }

            // Return response
            return res.json(responseData);

        } catch (error) {
            console.error("Error in LLM processing:", error.message);
            return res.status(500).json({ success: false, message: "Error in model processing" });
        }
    } catch (error) {
        console.error("General error in query endpoint:", error);
        return res.status(500).json({ success: false, message: "Server error processing query" });
    }
});

// Validation rules for signup
const signupValidation = [
    body('username')
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Name is required and must be less than 100 characters')
];

app.post("/api/signup", signupLimiter, signupValidation, handleValidationErrors, async (req, res) => {
    try {
        const { username, name, email, password } = req.body;

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ message: "Username is already taken" });
        }

        // Check if the email already exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: "Email is already registered" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user
        const newUser = new User({ username, name, email, password: hashedPassword });
        await newUser.save();
        
        // Send welcome email
        try {
            console.log("Attempting to send welcome email to:", email);
            const emailResult = await sendWelcomeEmail(newUser);
            console.log("Welcome email sending result:", emailResult);
        } catch (emailError) {
            console.error("Failed to send welcome email:", emailError);
            // Continue with registration even if email fails
        }

        res.status(201).json({ message: "User created successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Validation rules for login
const loginValidation = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

app.post("/api/login", loginLimiter, loginValidation, handleValidationErrors, async (req, res) => {
    try {
        const { email, password, timezone } = req.body;

        // Find user by email
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Update user's timezone if provided
        if (timezone) {
            user.timezone = timezone;
            await user.save();
        }

        // Create and sign JWT token
        try {
            const token = jwt.sign(
                { userId: user._id, username: user.username }, 
                JWT_SECRET_KEY, 
                { expiresIn: "30d" }
            );
            res.json({ 
                message: "Login successful", 
                token,
                userId: user._id,
                username: user.username,
                name: user.name
            });
        } catch (jwtError) {
            console.error("JWT Error:", jwtError); // IMPORTANT: Log JWT signing errors
            return res.status(500).json({ message: "Internal server error" });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Get all chats for the authenticated user
app.get('/api/chats', authenticateToken, async (req, res) => {
    try {
        const user = await findUserByUsername(req.user.username, res);
        if (!user) return;
        
        const chats = await Chat.find({ userId: user._id })
            .select('_id title createdAt updatedAt')
            .sort({ updatedAt: -1 });
        
        res.json({ success: true, chats });
    } catch (error) {
        console.error("Error fetching chats:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Get a specific chat by ID
app.get('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const user = await findUserByUsername(req.user.username, res);
        if (!user) return;
        
        const chat = await Chat.findOne({ _id: req.params.chatId, userId: user._id });
        
        if (!chat) {
            return res.status(404).json({ message: "Chat not found" });
        }
        
        res.json({ success: true, chat });
    } catch (error) {
        console.error("Error fetching chat:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Create a new empty chat
app.post('/api/chats', authenticateToken, async (req, res) => {
    try {
        const user = await findUserByUsername(req.user.username, res);
        if (!user) return;
        
        const title = req.body.title || 'New Chat';
        
        const chat = new Chat({
            userId: user._id,
            title: title
        });
        
        await chat.save();
        
        res.status(201).json({ success: true, chat });
    } catch (error) {
        console.error("Error creating chat:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Update a chat's title
app.put('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const user = await findUserByUsername(req.user.username, res);
        if (!user) return;
        
        const chat = await Chat.findOne({ _id: req.params.chatId, userId: user._id });
        
        if (!chat) {
            return res.status(404).json({ message: "Chat not found" });
        }
        
        if (req.body.title) {
            chat.title = req.body.title;
        }
        
        chat.updatedAt = new Date();
        await chat.save();
        
        res.json({ success: true, chat });
    } catch (error) {
        console.error("Error updating chat:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Delete a chat
app.delete('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const user = await findUserByUsername(req.user.username, res);
        if (!user) return;
        
        const result = await Chat.deleteOne({ _id: req.params.chatId, userId: user._id });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Chat not found" });
        }
        
        res.json({ success: true, message: "Chat deleted" });
    } catch (error) {
        console.error("Error deleting chat:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/api/user/profile", authenticateToken, async (req, res) => {
    try {
        const user = await findUserByUsername(req.user.username, res);
        if (!user) return;

        res.json({
            socialProfiles: user.socialProfiles,
            selfAssessment: user.selfAssessment,
            pdfs: user.pdfs,
            images: user.images,
            ratings: user.ratings
        });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/api/user/profile/:username", async (req, res) => {
    try {
        const { username } = req.params;
        
        const user = await findUserByUsername(username, res);
        if (!user) return;

        // Return only the ratings
        res.json({
            ratings: user.ratings,
        });
    } catch (error) {
        console.error("Error fetching user ratings:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/api/user/profile/:username/full", async (req, res) => {
    try {
        const { username } = req.params;

        const user = await findUserByUsername(username, res);
        if (!user) return;

        // Return only the ratings
        res.json({
            username: user.username,
            pdfs: user.pdfs,
            images: user.images,
            selfAssessment: user.selfAssessment,
            socialProfiles: user.socialProfiles,
        });
    } catch (error) {
        console.error("Error fetching user ratings:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});



// Add the generate-caption endpoint
app.post('/api/generate-caption', apiLimiter, async (req, res) => {
    try {
        // Verify authentication
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        try {
            jwt.verify(token, JWT_SECRET_KEY);
        } catch (error) {
            return res.status(401).json({ success: false, message: "Invalid token" });
        }

        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, message: "No image provided" });
        }

        // Convert base64 to buffer
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Make request to Hugging Face API
        const response = await fetch(HUGGING_FACE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: imageBuffer
        });

        if (!response.ok) {
            throw new Error(`Hugging Face API error: ${response.statusText}`);
        }

        const result = await response.json();
        
        // The API returns an array of generated captions, we'll take the first one
        const caption = Array.isArray(result) && result.length > 0 ? result[0].generated_text : "Could not generate caption";

        res.json({ success: true, caption });

    } catch (error) {
        console.error('Error generating caption:', error);
        res.status(500).json({ 
            success: false, 
            message: "Error generating caption",
            error: error.message 
        });
    }
});

// Add endpoint for Google Calendar configuration
app.get("/api/config/google-calendar", (req, res) => {
    res.json({
        clientId: process.env.GOOGLE_CLIENT_ID,
        apiKey: process.env.GOOGLE_CALENDAR_API_KEY,
        discoveryDoc: process.env.GOOGLE_CALENDAR_DISCOVERY_DOC || 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
        scopes: process.env.GOOGLE_CALENDAR_SCOPES || 'https://www.googleapis.com/auth/calendar.readonly'
    });
});

// Add a route to test email delivery
app.post('/api/test-email', authenticateToken, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: "Email address is required" });
        }
        
        const result = await testEmailDelivery(email);
        res.json(result);
    } catch (error) {
        console.error("Error testing email delivery:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to test email delivery",
            error: error.message
        });
    }
});

// Serve the email test page
app.get('/email-test', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "email-test.html"));
});

// Embed chat endpoint - for external websites
app.post('/api/embed/chat', apiLimiter, async (req, res) => {
    try {
        const { query, username, chatHistory, apiKey } = req.body;

        // Input Validation
        if (!query || query.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Query cannot be empty" });
        }

        if (!apiKey || apiKey.trim().length === 0) {
            return res.status(400).json({ success: false, message: "API key is required" });
        }

        // Basic validation of API key format
        if (!apiKey.startsWith('AI') || apiKey.length < 20) {
            return res.status(400).json({ success: false, message: "Invalid API key format" });
        }

        // Get user data for self-assessment
        // For embedded users, we'll use a generic one if username is not provided
        let userSelfAssessment = "";
        let name = "Mimikree Assistant";
        
        if (username && username !== 'embedded-user') {
            const user = await User.findOne({ username: username });
            if (user && user.selfAssessment) {
                userSelfAssessment = user.selfAssessment;
                name = user.name || "Mimikree Assistant";
            }
        }

        // Format chat history
        let updatedHistory = [];
        if (chatHistory && Array.isArray(chatHistory)) {
            updatedHistory = chatHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
        }

        // Prepare data for the LLaMA server
        const dataForModel = {
            query: query,
            selfAssessment: userSelfAssessment || "I am an AI assistant powered by Mimikree, designed to be helpful, harmless, and honest.",
            username: username || 'embedded-user',
            name: name,
            own_model: false, // Embedded users don't have their own model
            chatHistory: updatedHistory,
            apiKey: apiKey // Pass the API key to the LLaMA server
        };

        // Forward the request to the LLaMA server
        const response = await axios.post(`${config.llamaServer}/ask_embed`, dataForModel);

        // Response Handling
        if (!response.data || !response.data.response) {
            console.error("Invalid response from LLM:", response.data);
            return res.status(500).json({ success: false, message: "Invalid response from LLM" });
        }

        return res.json({
            success: true,
            response: response.data.response,
            hasPersonalData: response.data.hasPersonalData || false,
            username: username,
            name: name
        });

    } catch (error) {
        console.error("Error in embedded chat:", error);
        return res.status(500).json({ 
            success: false, 
            message: "An error occurred while processing your request"
        });
    }
});

// Serve embed page
app.get('/embed.html', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "embed.html"));
});

// Serve embed sample page
app.get('/embed-sample', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "embed-sample.html"));
});

// Serve iframe preview page
app.get('/iframe-preview', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "iframe-preview.html"));
});

// Proxy route for memory storage
app.post('/store_memory', async (req, res) => {
    try {
        const response = await axios.post(`${config.llamaServer}/store_memory`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Error storing memory:', error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to store memory",
            error: error.message 
        });
    }
});

// Add GDPR data access endpoint
app.get('/api/user/data-export', authenticateToken, async (req, res) => {
    try {
        // Get user ID from token
        const userId = req.user.userId;
        
        // Fetch user data
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Fetch user chats
        const chats = await Chat.find({ userId: userId });
        
        // Create comprehensive data export
        const userData = {
            account: {
                username: user.username,
                email: user.email,
                name: user.name,
                timezone: user.timezone,
                createdAt: user._id.getTimestamp()
            },
            socialProfiles: user.socialProfiles || {},
            selfAssessment: user.selfAssessment || {},
            pdfs: user.pdfs || [],
            images: user.images || [],
            chats: chats.map(chat => ({
                title: chat.title,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
                messages: chat.messages
            }))
        };

        // Return the data as JSON
        res.json({
            success: true,
            data: userData,
            message: "Data export successful"
        });
        
    } catch (error) {
        console.error("Error exporting user data:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to export user data",
            error: error.message
        });
    }
});

// Add data deletion request endpoint
app.delete('/api/user/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { password } = req.body;
        
        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }
        
        // Delete user's vectors from Pinecone
        try {
            await axios.post(`${config.llamaServer}/delete_user_data`, {
                username: user.username
            });
        } catch (deleteError) {
            console.error("Error deleting user vectors:", deleteError);
            // Continue with account deletion even if vector deletion fails
        }
        
        // Delete user's chats
        await Chat.deleteMany({ userId: userId });
        
        // Delete user's uploaded images from Cloudinary
        if (user.images && user.images.length > 0) {
            for (const image of user.images) {
                try {
                    // Extract public_id from Cloudinary URL
                    const urlParts = image.url.split('/');
                    const publicIdWithExtension = urlParts[urlParts.length - 1];
                    const publicId = publicIdWithExtension.split('.')[0];
                    
                    await cloudinary.uploader.destroy(publicId);
                } catch (cloudinaryError) {
                    console.error("Error deleting image from Cloudinary:", cloudinaryError);
                    // Continue with deletion process
                }
            }
        }
        
        // Finally, delete the user account
        await User.findByIdAndDelete(userId);
        
        res.json({ 
            success: true, 
            message: "Account deleted successfully. We're sorry to see you go!"
        });
        
    } catch (error) {
        console.error("Error deleting user account:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to delete account",
            error: error.message
        });
    }
});

// Serve sitemap.xml
app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.sendFile(path.join(__dirname, "public", "sitemap.xml"));
});

// Serve robots.txt
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, "public", "robots.txt"));
});

// Update the data-privacy route
app.get('/data-privacy', (req, res) => {
    // Send the HTML file first, client-side JS will handle authentication
    res.sendFile(path.join(__dirname, "public", "data-privacy.html"));
});