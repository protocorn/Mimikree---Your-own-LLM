const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const githubRoutes = require("./src/github");
const twitterRoutes = require("./src/twitter");

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use(express.static("public"));
app.use(cors());

// API routes
app.use("/api/github", githubRoutes.router);
app.use("/api/twitter", twitterRoutes.router);

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

            combinedText += `GitHub Profile: ${JSON.stringify(collectedData.github)} `;
        }

        // Collect Twitter data
        if (data.socialProfiles.twitter) {
            const twitterResponse = await axios.post(`http://localhost:5000/api/twitter/scrape`, {
                username: data.socialProfiles.twitter.username
            });
            collectedData.twitter = twitterResponse.data;
            combinedText += `Twitter Profile: ${JSON.stringify(collectedData.twitter)} `;
        }

        for (const doc of documents) {
            await axios.post('http://localhost:5002/process', { document: doc });
        }
        await axios.post('http://localhost:5002/ask', { query: "What is the name of the person? What programming languages does he know" });

        res.json({ success: true, message: "Data sent successfully" });

    } catch (error) {
        console.error("Error processing data:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/api/ask", async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ success: false, message: "Query is required" });
        }

        // Send the query to LLaMA
        const llamaResponse = await axios.post('http://localhost:5002/ask', { query });

        res.json({
            success: true,
            question: query,
            answer: llamaResponse.data.response
        });

        print(res.answer)

    } catch (error) {
        console.error("Error processing question:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));