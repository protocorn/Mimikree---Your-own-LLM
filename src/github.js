const axios = require("axios");
const { GITHUB_API_URL, GITHUB_TOKEN, USER_AGENT } = require("../config/apiKeys");

// Fetch GitHub Profile
const getGitHubProfile = async (username) => {
    try {
        const response = await axios.get(`${GITHUB_API_URL}users/${username}`, {
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`,
                "User-Agent": USER_AGENT,
            },
        });

        return {
            login: response.data.login,
            name: response.data.name,
            bio: response.data.bio,
            public_repos: response.data.public_repos,
            followers: response.data.followers,
            following: response.data.following,
            avatar_url: response.data.avatar_url,
        };
    } catch (error) {
        console.error("Error fetching GitHub profile:", error.message);
        return { error: "Failed to fetch GitHub profile" };
    }
};

// Fetch Repositories
const getGitHubRepositories = async (username) => {
    try {
        const response = await axios.get(`${GITHUB_API_URL}users/${username}/repos`, {
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`,
                "User-Agent": USER_AGENT,
            },
        });

        // Collect repos data including name, description, and README content
        const repos = await Promise.all(
            response.data.map(async (repo) => {
                const repoDetails = await getRepoDetails(username, repo.name);
                return {
                    name: repo.name,
                    description: repo.description,
                    readme: repoDetails.readme,
                };
            })
        );
        return repos;
    } catch (error) {
        console.error("Error fetching repositories:", error.message);
        return { error: "Failed to fetch repositories" };
    }
};

// Fetch Repository Details (Languages + README)
const getRepoDetails = async (username, repoName) => {
    try {
        const repoResponse = await axios.get(`${GITHUB_API_URL}repos/${username}/${repoName}`, {
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`,
                "User-Agent": USER_AGENT,
            },
        });

        const defaultBranch = repoResponse.data.default_branch;

        let readme = "No README available";
        try {
            const readmeResponse = await axios.get(
                `https://raw.githubusercontent.com/${username}/${repoName}/${defaultBranch}/README.md`,
                {
                    headers: {
                        Authorization: `token ${GITHUB_TOKEN}`,
                        "User-Agent": USER_AGENT,
                    },
                }
            );
            readme = readmeResponse.data;
        } catch (readmeError) {
            console.log(`Failed to fetch README for ${repoName}: ${readmeError.message}`);
        }

        return {
            name: repoResponse.data.name,
            description: repoResponse.data.description,
            html_url: repoResponse.data.html_url,
            readme,
        };

    } catch (error) {
        console.error(`Error fetching repo details for ${repoName}:`, error.message);
        return { error: `Failed to fetch details for ${repoName}` };
    }
};

const express = require("express");
const router = express.Router();

// API endpoint for fetching GitHub data
router.post("/profile", async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    try {
        const profileData = await getGitHubProfile(username);
        const reposData = await getGitHubRepositories(username);

        // Combine profile and repos data into one object
        const result = {
            profile: profileData,
            repositories: reposData,
        };

        res.json(result);
    } catch (error) {
        console.error("Error fetching GitHub data:", error);
        res.status(500).json({ error: "Failed to fetch GitHub data" });
    }
});

module.exports = { getGitHubProfile, getGitHubRepositories, router };
