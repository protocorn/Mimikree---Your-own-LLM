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
const PORT = 3000;

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
    name: { type: String, required: true },
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
    pdfs: [String]
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
            const githubResponse = await axios.post(`https://mimikree-your-own-llm.vercel.app/api/github/profile`, {
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
            const linkedinResponse = await axios.post(`https://mimikree-your-own-llm.vercel.app/api/linkedin/profile`, {
                linkedInUrl: data.socialProfiles.linkedin.url
            });

            collectedData.linkedin = linkedinResponse.data.profile;


            // Store LinkedIn data in Pinecone
            documents.push(JSON.stringify(linkedinResponse.data.profile));

            combinedText += `LinkedIn Profile: ${JSON.stringify(collectedData.linkedin)} `;
        }
        // Collect Twitter data
        if (data.socialProfiles.twitter) {
            const twitterResponse = await axios.post(`https://mimikree-your-own-llm.vercel.app/api/twitter/profile`, {
                username: data.socialProfiles.twitter.username
            });
            collectedData.twitter = twitterResponse.data;
            documents.push(JSON.stringify(collectedData.twitter));
        }

        if (data.socialProfiles.medium) {
            const mediumResponse = await axios.post(`https://mimikree-your-own-llm.vercel.app/api/medium/profile`, {
                username: data.socialProfiles.medium.username
            });
            collectedData.medium = mediumResponse.data;
            mediumResponse.data.articles.forEach(article => {
                documents.push(JSON.stringify(`Medium Aricle \n Title: ${article.title} \n Link: ${article.link} \n Content: ${article.content}`));
            })
        }
        if (data.socialProfiles.reddit) {
            const redditResponse = await axios.post(`https://mimikree-your-own-llm.vercel.app/api/reddit/profile`, {
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
                    await axios.post('https://llama-server.fly.dev/process', { document: doc, username: username });
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


app.post("/api/query/:username", async (req, res) => {
    try {
        const { query } = req.body;
        const { username } = req.params;

        //let myusername;
        //let is_own_model = false;

        /*const token = req.headers.authorization?.split(" ")[1];
        console.log(token);
        if (token) {
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET_KEY);
                myusername = decoded.username;
            }
            catch (error){
                console.log(error);
            }
        }*/

        //console.log(myusername);

        /*if(username==myusername){
            is_own_model=true;
        }*/

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
                name: user.name, // Include name if needed by your LLM
                //own_model: true,
            };

            const response = await axios.post(`https://llama-server.fly.dev/ask`, dataForModel,{responseType: 'stream'});
            response.data.pipe(res); 
            
            /*/ 6. Response Handling (Important!)
            /if (!response.data || !response.data.response) { // Check for valid response structure
                console.error("Invalid response from LLM:", response.data);
                return res.status(500).json({ success: false, message: "Invalid response from LLM" });
            }*/

            //console.log("LLM Response:", response.data.response); // Log the LLM's response
            //res.json({ success: true, response: response.data.response });

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
            selfAssessment: user.selfAssessment,
            pdfs: user.pdfs
        });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});




app.listen(PORT, () => console.log(`Server running on port ${PORT}`));