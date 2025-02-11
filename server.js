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
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();


const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use(express.static("public"));
app.use(cors());

// API routes
app.use("/api/github", githubRoutes.router);
app.use("/api/twitter", twitterRoutes.router);
app.use("/api/linkedin", linkedinRoutes.router);
app.use("/api/medium", mediumRoutes.router);

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
        medium : {type: String, required: false }
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
        let combinedText = "";
        let documents = [];

        // Collect GitHub data
        if (data.socialProfiles.github) {
            const githubResponse = await axios.post(`http://localhost:5000/api/github/profile`, {
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
            const linkedinResponse = await axios.post(`http://localhost:5000/api/linkedin/profile`, {
                linkedInUrl: data.socialProfiles.linkedin.url
            });

            collectedData.linkedin = linkedinResponse.data.profile;


            // Store LinkedIn data in Pinecone
            documents.push(JSON.stringify(linkedinResponse.data.profile));

            combinedText += `LinkedIn Profile: ${JSON.stringify(collectedData.linkedin)} `;
        }
        // Collect Twitter data
        if (data.socialProfiles.twitter) {
            const twitterResponse = await axios.post(`http://localhost:5000/api/twitter/profile`, {
                username: data.socialProfiles.twitter.username
            });
            collectedData.twitter = twitterResponse.data;
            documents.push(JSON.stringify(collectedData.twitter));
        }

        if (data.socialProfiles.medium) {
            const mediumResponse = await axios.post(`http://localhost:5000/api/medium/profile`, {
                username: data.socialProfiles.medium.username
            });
            collectedData.medium = mediumResponse.data;
            mediumResponse.data.articles.forEach(article =>{
                documents.push(JSON.stringify(`Medium Aricle \n Title: ${article.title} \n Link: ${article.link} \n Content: ${article.content}`));
            })  
        }

        if (data.pdfs) {
            collectedData.pdfs = data.pdfs;
            data.pdfs.forEach(pdf =>{
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
                    await axios.post('http://localhost:5002/process', { document: doc, username: username });
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
                    await updateUserSocialMediaProfile(username, data.socialProfiles.twitter.username, "medium");
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
                if (data.pdfs){
                    try {
                        await updatePDFs(username, data.pdfs);
                        console.log(`Updated pdfs for user: ${username}`);
                    } catch (error) {
                        console.error("Error updating pdfs:", error);
                    }
                }
            }
            catch {
                console.error("Invalid token");
            }
        }
        else {
            return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
        }


        res.json({ success: true, message: "Data sent successfully" });

    } catch (error) {
        console.error("Error processing data:", error);
        res.status(500).json({ success: false, message: "Server error" });
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

app.get("/query", async (req, res) => {
    const username = req.query.username;

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


// Add new route to handle user queries
app.post("/api/query/username=:username", async (req, res) => {
    try {
        const { query } = req.body; // Get the user's query
        const { username } = req.params;

        // Validate the query
        if (!query || query.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Query cannot be empty" });
        }

        // Fetch user's selfAssessment data from MongoDB
        const user = await User.findOne({ username: username });
        if (!user || !user.selfAssessment) {
            return res.status(404).json({ success: false, message: "User or self-assessment data not found" });
        }

        const dataForModel = {
            query: query,
            selfAssessment: user.selfAssessment,
            username: username
        };

        // Send the query to the Flask API (assuming Flask is running on port 5002)
        const response = await axios.post(`http://localhost:5002/ask`, dataForModel);

        console.log(response.data.response)

        // Return the response from the model
        res.json({ success: true, response: response.data.response });
    } catch (error) {
        console.error("Error processing query:", error);
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

        // Create and sign JWT token
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET_KEY, { expiresIn: "1h" });

        res.json({ message: "Login successful", token });
    } catch (error) {
        console.error(error);
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