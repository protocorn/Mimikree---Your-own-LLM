const express = require("express");
const cors = require("cors");
const path = require("path");
const githubRoutes = require("./src/github");
const twitterRoutes = require("./src/twitter");
// const linkedinRoutes = require('./src/linkedin');

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use(express.static("public"));
app.use(cors());

// API routes
app.use("/api/github", githubRoutes.router); // Updated to use the GitHub router
app.use("/api/twitter", twitterRoutes.router); // Updated to use the GitHub router


// Route to handle form submission
app.post("/api/submit", async (req, res) => {
    try {
        const data = req.body;
        console.log("Received Data:", data);

        const collectedData = {};

        if (data.socialProfiles.github) {
            const githubResponse = await fetch(`http://localhost:5000/api/github/profile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: data.socialProfiles.github.username }),
            });
            const githubData = await githubResponse.json();
            collectedData.github = githubData; // Store GitHub data
        }

        if (data.socialProfiles.twitter) {
            const twitterResponse = await fetch(`http://localhost:5000/api/twitter/scrape`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: data.socialProfiles.twitter.username }),
            });
            const twitterData = await twitterResponse.json();
            collectedData.twitter = twitterData; // Store GitHub data
        }

        if (data.socialProfiles.linkedin) {
            // Similar API calls for LinkedIn...
        }

        res.json({ success: true, data: collectedData });
        console.log(JSON.stringify(collectedData.twitter));
    } catch (error) {
        console.error("Error processing data:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
