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
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();


const app = express();
const PORT = 5080;

// Middleware
app.use(express.json());
app.use(express.static("public"));
app.use(cors());

// API routes
app.use("/api/github", githubRoutes.router);
app.use("/api/twitter", twitterRoutes.router);
app.use("/api/linkedin", linkedinRoutes.router);
app.use("/api/medium", mediumRoutes.router);
app.use("/api/reddit", redditRoutes.router);

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: {type: String, required:true},
    socialProfiles: {
        github: { type: String, required: false },
        linkedin: { type: String, required: false },
        twitter: { type: String, required: false },
        medium : {type: String, required: false },
        reddit : {type: String, required: false }
    },
    selfAssessment: {
        communicationStyle: { type: String, required: false },
        personalityTraits: [{ type: String }],
        writingSample: { type: String, required: false },
        interests: [{ type: String }]
    }
});

const User = mongoose.model('User', userSchema);

// JWT Secret Key (stored in .env file for security)
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

app.get('/add-data', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "data.html"));
});


app.get('/signup', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "signup.html"));
});

app.get('/login', async (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});


// Route to handle form submission
app.post("/api/submit", async (req, res) => {
    try {
        const data = req.body;
        console.log("Received Data:", data);

        const collectedData = {};
        let documents = [];

        // ✅ Respond immediately so Vercel doesn't time out
        res.json({ success: true, message: "Processing data in the background" });

        // ✅ Process social profiles in parallel
        const socialProfiles = data.socialProfiles || {};
        const apiRequests = [];

        // 🔹 GitHub Data (Limit repos to 5)
        if (socialProfiles.github) {
            apiRequests.push(
                axios.post(`https://mimikree-your-own-llm-ohdu.vercel.app/api/github/profile`, {
                    username: socialProfiles.github.username
                }).then(response => {
                    collectedData.github = response.data;
                    if (response.data.repositories) {
                        response.data.repositories.slice(0, 5).forEach(repo => {
                            documents.push(`Repository Name: ${repo.name} - Readme.md: ${repo.readme || "No README available"}`);
                        });
                    }
                    documents.push(JSON.stringify(response.data.profile));
                }).catch(err => console.error("GitHub API Error:", err.message))
            );
        }

        // 🔹 LinkedIn Data
        if (socialProfiles.linkedin) {
            apiRequests.push(
                axios.post(`https://mimikree-your-own-llm-ohdu.vercel.app/api/linkedin/profile`, {
                    linkedInUrl: socialProfiles.linkedin.url
                }).then(response => {
                    collectedData.linkedin = response.data.profile;
                    documents.push(JSON.stringify(response.data.profile));
                }).catch(err => console.error("LinkedIn API Error:", err.message))
            );
        }

        // 🔹 Twitter Data
        if (socialProfiles.twitter) {
            apiRequests.push(
                axios.post(`https://mimikree-your-own-llm-ohdu.vercel.app/api/twitter/profile`, {
                    username: socialProfiles.twitter.username
                }).then(response => {
                    collectedData.twitter = response.data;
                    documents.push(JSON.stringify(response.data));
                }).catch(err => console.error("Twitter API Error:", err.message))
            );
        }

        // 🔹 Medium Data
        if (socialProfiles.medium) {
            apiRequests.push(
                axios.post(`https://mimikree-your-own-llm-ohdu.vercel.app/api/medium/profile`, {
                    username: socialProfiles.medium.username
                }).then(response => {
                    collectedData.medium = response.data;
                    response.data.articles.forEach(article => {
                        documents.push(`Medium Article \n Title: ${article.title} \n Link: ${article.link} \n Content: ${article.content}`);
                    });
                }).catch(err => console.error("Medium API Error:", err.message))
            );
        }

        // 🔹 Reddit Data
        if (socialProfiles.reddit) {
            apiRequests.push(
                axios.post(`https://mimikree-your-own-llm-ohdu.vercel.app/api/reddit/profile`, {
                    username: socialProfiles.reddit.username
                }).then(response => {
                    collectedData.reddit = response.data;
                    response.data.posts.forEach(post => {
                        documents.push(`Reddit Post \n Title: ${post.title} \n Link: ${post.url} \n Content: ${post.content}`);
                    });
                }).catch(err => console.error("Reddit API Error:", err.message))
            );
        }

        // 🔹 Process PDFs
        if (data.pdfs) {
            collectedData.pdfs = data.pdfs;
            data.pdfs.forEach(pdf => {
                documents.push(`PDF Name: ${pdf.filename} \n PDF Content: ${pdf.text}`);
            });
        }

        // ✅ Fetch all APIs in parallel
        await Promise.all(apiRequests);

        // ✅ Process Data for Llama Model
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET_KEY);
                const username = decoded.username;

                // 🔹 Send documents to Llama Model in parallel
                await Promise.all(documents.map(doc => 
                    axios.post('https://llama-server.fly.dev/process', { document: doc, username })
                ));

                // 🔹 Update user profiles in parallel
                const updateProfileRequests = [];
                if (socialProfiles.github) {
                    updateProfileRequests.push(updateUserSocialMediaProfile(username, socialProfiles.github.username, "github"));
                }
                if (socialProfiles.linkedin) {
                    updateProfileRequests.push(updateUserSocialMediaProfile(username, socialProfiles.linkedin.url, "linkedin"));
                }
                if (socialProfiles.twitter) {
                    updateProfileRequests.push(updateUserSocialMediaProfile(username, socialProfiles.twitter.username, "twitter"));
                }
                if (socialProfiles.medium) {
                    updateProfileRequests.push(updateUserSocialMediaProfile(username, socialProfiles.medium.username, "medium"));
                }
                if (data.selfAssessment) {
                    updateProfileRequests.push(updateUserSelfAssessment(username, data.selfAssessment));
                }
                if (data.pdfs) {
                    updateProfileRequests.push(updatePDFs(username, data.pdfs));
                }

                await Promise.all(updateProfileRequests);
                console.log("✅ User profiles and data updated successfully");

            } catch (error) {
                console.error("JWT Verification Error:", error.message);
            }
        } else {
            console.error("Unauthorized: No token provided");
        }

    } catch (error) {
        console.error("Error in /api/submit:", error);
    }
});


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

async function updatePDFs(username, pdfData) {
    try {
        await User.updateOne(
            { username: username },
            { $set: { pdf: pdfData } }
        );
        console.log(`Updated pdfs data for user: ${username}`);
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

app.get("/", async (req, res) =>{
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


app.post("/api/query/:username", async (req, res) => {
    try {
        const { query } = req.body;
        const { username } = req.params;

        // 1. Input Validation (Crucial)
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
                name: user.name // Include name if needed by your LLM
            };

            const response = await axios.post(`https://llama-server.fly.dev/ask`, dataForModel);

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
        const { email, password } = req.body;
        console.log("Login attempt:", { email, password }); // TEMPORARY DEBUG LOGGING

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

        // Create and sign JWT token
        try {
            const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET_KEY, { expiresIn: "1h" });
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
            selfAssessment: user.selfAssessment
        });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});




app.listen(PORT, () => console.log(`Server running on port ${PORT}`));