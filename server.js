    const express = require("express");
    const cors = require("cors");
    const path = require("path");
    const axios = require("axios");
    const githubRoutes = require("./src/github");
    const twitterRoutes = require("./src/twitter");
    const linkedinRoutes = require("./src/linkedin");


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

                await axios.post('http://localhost:5002/process', { document: JSON.stringify(githubResponse.data.profile) })

                combinedText += `GitHub Profile: ${JSON.stringify(collectedData.github)} `;
            }


            if (data.socialProfiles.linkedin) {
                const linkedinResponse = await axios.post(`http://localhost:5000/api/linkedin/profile`, {
                    linkedInUrl: data.socialProfiles.linkedin.url
                });
                
                collectedData.linkedin = linkedinResponse.data.profile;


                // Store LinkedIn data in Pinecone
                await axios.post('http://localhost:5002/process', { document: JSON.stringify(linkedinResponse.data.profile) });

                combinedText += `LinkedIn Profile: ${JSON.stringify(collectedData.linkedin)} `;
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

            res.json({ success: true, message: "Data sent successfully" });

        } catch (error) {
            console.error("Error processing data:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });
    app.get("/query", (req, res) => {
        res.sendFile(path.join(__dirname, "public", "query.html"));
    });

    // Add new route to handle user queries
    app.post("/api/query", async (req, res) => {
        try {
            const { query } = req.body; // Get the user's query

            // Validate the query
            if (!query || query.trim().length === 0) {
                return res.status(400).json({ success: false, message: "Query cannot be empty" });
            }

            // Send the query to the Flask API (assuming Flask is running on port 5002)
            const response = await axios.post(`http://localhost:5002/ask`, { query });

            console.log(response.data.response)

            // Return the response from the model
            res.json({ success: true, response: response.data.response });
        } catch (error) {
            console.error("Error processing query:", error);
            res.status(500).json({ success: false, message: "Server error while processing query" });
        }
    });


    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));