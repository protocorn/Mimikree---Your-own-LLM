const express = require("express");
const axios = require("axios");

const router = express.Router();

// Scrapin API key
const API_KEY = "sk_f7b04ee94d08fad6f7046627ba6008cf22702801";

function processDates(data) {
    const today = new Date();

    if (data.educationHistory && Array.isArray(data.educationHistory)) {
        data.educationHistory.forEach(edu => {
            if (edu.startEndDate) {
                const start = edu.startEndDate.start;
                const end = edu.startEndDate.end;
                
                edu.startDate = start ? new Date(`${start.month}/1/${start.year}`) : null;
                edu.endDate = end ? new Date(`${end.month}/1/${end.year}`) : null;
                edu.current = !edu.endDate || edu.endDate >= today;
            }
        });

        data.educationHistory.sort((a, b) => b.startDate - a.startDate);
    }

    if (data.positions && data.positions.positionHistory && Array.isArray(data.positions.positionHistory)) {
        data.positions.positionHistory.forEach(pos => {
            if (pos.startEndDate) {
                const start = pos.startEndDate.start;
                const end = pos.startEndDate.end;
                
                pos.startDate = start ? new Date(`${start.month}/1/${start.year}`) : null;
                pos.endDate = end ? new Date(`${end.month}/1/${end.year}`) : null;
                pos.current = !pos.endDate || pos.endDate >= today;
            }
        });

        data.positions.positionHistory.sort((a, b) => b.startDate - a.startDate);
    }

    return data;
}

function extractAndCombine(data) {
    const extracted = { ...data };

    // Convert skills array to a comma-separated string
    if (data.skills && Array.isArray(data.skills)) {
        extracted.skills = data.skills.join(", ");
    }

    // Format Education History
    if (data.educationHistory && Array.isArray(data.educationHistory)) {
        const education_strings = data.educationHistory.map(edu => {
            const degree = edu.degreeName || "Degree";
            const major = edu.fieldOfStudy || "Field of Study";
            const school = edu.schoolName || "Unknown School";
            return `${degree} in ${major} from ${school}`;
        });

        extracted.education = education_strings.join(". ");
        delete extracted.educationHistory;
    }

    // Format Work Experience (Positions)
    if (data.positions && data.positions.positionHistory && Array.isArray(data.positions.positionHistory)) {
        const position_strings = data.positions.positionHistory.map(pos => {
            const title = pos.title || "Unknown Position";
            const company = pos.companyName || "Unknown Company";
            return `${title} at ${company}`;
        });

        extracted.positions = position_strings.join(". ");
        delete extracted.positions.positionHistory;
    } else {
        extracted.positions = "No work experience listed.";
    }

    return extracted;
}


router.post("/profile", async (req, res) => {
    try {
        const { linkedInUrl } = req.body;

        if (!linkedInUrl) {
            return res.status(400).json({ success: false, message: "LinkedIn URL is required" });
        }

        const apiUrl = `https://api.scrapin.io/enrichment/profile?apikey=${API_KEY}&linkedInUrl=${encodeURIComponent(linkedInUrl)}`;

        const response = await axios.get(apiUrl);


        let processedData = processDates(response.data.person);
        processedData = extractAndCombine(processedData);

        console.log(JSON.stringify(processedData))

        res.json({ success: true, profile: processedData });
        
        return res

    } catch (error) {
        console.error("Error fetching or processing LinkedIn data:", error);
        res.status(500).json({ success: false, message: "Error retrieving or processing LinkedIn profile" });
    }
});

module.exports = { router };