const express = require("express");
const cors = require("cors");
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Add Hugging Face API configuration
const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;
const HUGGING_FACE_API_URL = process.env.HUGGING_FACE_API_URL;

// MongoDB Connection Setup - Moved to the top
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 15000, // Increase timeout to 15 seconds
    socketTimeoutMS: 45000, // Socket timeout
    connectTimeoutMS: 15000, // Connection timeout
    maxPoolSize: 10, // Maximum number of connections in the pool
    retryWrites: true,
    w: 'majority'
})
.then(() => {
    console.log("Connected to MongoDB");
    // Start the server only after successful MongoDB connection
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})
.catch((err) => {
    console.error("Initial MongoDB connection error:", err);
    // Attempt to reconnect after a delay
    setTimeout(() => {
        mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 15000,
            maxPoolSize: 10,
            retryWrites: true,
            w: 'majority'
        })
        .then(() => console.log("Reconnected to MongoDB"))
        .catch((reconnectErr) => console.error("Failed to reconnect:", reconnectErr));
    }, 5000);
});

// Middleware
app.use(express.json({ limit: '50mb' })); // Increase limit to 50MB
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
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
        console.log(token);
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
                            const result = await cloudinary.uploader.upload(image.src, {
                                public_id: `user_${username}_${Date.now()}`,
                            });
                            const imageUrl = result.secure_url;
                            await updateUserImages(username, imageUrl, image.description);
                            
                            // Create a comprehensive image document that includes both caption and description
                            const imageDocument = {
                                url: imageUrl,
                                caption: image.caption || '',
                                description: image.description || '',
                                type: 'image'
                            };

                            // Send both caption and description to llama_server
                            await axios.post(`${config.llamaServer}/process`, { 
                                document: `Image Analysis:
URL: ${imageUrl}
AI Generated Caption: ${image.caption}
User Description: ${image.description}`, 
                                username: username 
                            });

                            console.log(`Image uploaded and processed: ${imageUrl}`);
                        } catch (uploadError) {
                            console.error("Error uploading image:", uploadError);
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

async function updateUserImages(username, imageUrl, imageDescription) {
    try {
        const user = await User.findOne({ username: username });
        if (!user) {
            console.log(`User not found: ${username}`);
            return;
        }

        if (!user.images) {
            user.images = [];
        }

        user.images.push({ url: imageUrl, description: imageDescription });
        await user.save();

        console.log(`Image URL added for user: ${username}`);
    } catch (error) {
        console.error("Error updating images:", error);
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
app.post('/api/query/:username', async (req, res) => {
    try {
        const { query, chatHistory } = req.body;
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
        
        if (token) {
            let decoded;
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
                chatHistory: updatedHistory  // Include updated chat history in the request to LLama server
            };

            const response = await axios.post(`${config.llamaServer}/ask`, dataForModel);

            // 6. Response Handling (Important!)
            if (!response.data || !response.data.response) { // Check for valid response structure
                console.error("Invalid response from LLM:", response.data);
                return res.status(500).json({ success: false, message: "Invalid response from LLM" });
            }

            console.log("LLM Response:", response.data.response); // Log the LLM's response
            res.json({ success: true, response: response.data.response });

        } catch (dbError) {
            console.error("Database error fetching user:", dbError);
            return res.status(500).json({ success: false, message: "Database error" });
        }

    } catch (error) {
        console.error("Unexpected error in query route:", error);
        res.status(500).json({ success: false, message: "Server error while processing query" });
    }
});

app.post("/api/signup", async (req, res) => {
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

        res.status(201).json({ message: "User created successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { email, password, timezone } = req.body;
        console.log("Login attempt:", { email, password, timezone }); // TEMPORARY DEBUG LOGGING

        // Find user by email
        const user = await User.findOne({ email });
        console.log("User found:", user); // DEBUG LOGGING

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        console.log("Password match:", isMatch); // DEBUG LOGGING
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
            const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET_KEY, { expiresIn: "30d" });
            console.log("JWT Token:", token); //DEBUG LOGGING
            res.json({ message: "Login successful", token });
        } catch (jwtError) {
            console.error("JWT Error:", jwtError); // IMPORTANT: Log JWT signing errors
            return res.status(500).json({ message: "Internal server error" });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/api/user/profile", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, JWT_SECRET_KEY);
        const user = await User.findOne({ username: decoded.username });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

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

app.post("/api/rate/:username", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, JWT_SECRET_KEY);
        const raterUser = await User.findOne({ username: decoded.username });

        if (!raterUser) {
            return res.status(404).json({ message: "Rater user not found" });
        }

        const { username } = req.params;
        const { rating } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: "Invalid rating" });
        }

        const ratedUser = await User.findOne({ username: username });

        if (!ratedUser) {
            return res.status(404).json({ message: "Rated user not found" });
        }

        // Corrected duplicate rating check:
        const existingRating = ratedUser.ratings.find(r => r.rater.toString() === raterUser._id.toString());
        if (existingRating) {
            return res.status(400).json({ message: "You have already rated this model." });
        }

        ratedUser.ratings.push({
            rater: raterUser._id,
            rating: rating,
        });

        await ratedUser.save();

        res.json({ message: "Rating submitted successfully" });
    } catch (error) {
        console.error("Error rating user:", error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: "Invalid token" });
        }
        else{
            res.status(500).json({ message: "Try Logging in again" });
        }
    }
});

app.get("/api/user/profile/:username", async (req, res) => {
    try {
        const { username } = req.params;

        const user = await User.findOne({ username: username });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

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

        const user = await User.findOne({ username: username });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

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
app.post('/api/generate-caption', async (req, res) => {
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