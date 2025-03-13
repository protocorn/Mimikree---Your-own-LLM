const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Calendar Pattern Schema
const calendarPatternSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isConnected: { type: Boolean, default: true },
    // Store busy blocks for each day
    busyBlocks: [{
        date: Date,
        blocks: [{
            startTime: String,  // Format: "HH:mm"
            endTime: String,    // Format: "HH:mm"
            summary: String     // Optional event summary
        }]
    }]
});

const CalendarPattern = mongoose.model('CalendarPattern', calendarPatternSchema);

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Store calendar busy blocks
router.post('/patterns', verifyToken, async (req, res) => {
    try {
        const { busyBlocks } = req.body;
        
        console.log('Received calendar busy blocks:', {
            username: req.user.username,
            totalBlocks: busyBlocks.length
        });

        const user = await mongoose.model('User').findOne({ username: req.user.username });
        if (!user) {
            console.error('User not found:', req.user.username);
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('Found user:', user._id);

        const calendarPattern = await CalendarPattern.findOneAndUpdate(
            { userId: user._id },
            {
                busyBlocks,
                isConnected: true
            },
            { upsert: true, new: true }
        );

        console.log('Calendar busy blocks stored:', {
            userId: calendarPattern.userId,
            totalBlocks: calendarPattern.busyBlocks.length
        });

        res.json({ 
            message: 'Calendar busy blocks stored successfully',
            patternId: calendarPattern._id
        });
    } catch (error) {
        console.error('Error storing calendar busy blocks:', error);
        res.status(500).json({ message: 'Error storing calendar busy blocks', error: error.message });
    }
});

// Check specific availability
router.get('/check-availability/:username', async (req, res) => {
    try {
        const { date, time } = req.query;
        if (!date || !time) {
            return res.status(400).json({ error: 'Date and time are required' });
        }

        const user = await mongoose.model('User').findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const pattern = await CalendarPattern.findOne({ userId: user._id });
        if (!pattern || !pattern.isConnected) {
            return res.status(404).json({ error: 'Calendar not connected' });
        }

        const requestDate = new Date(date);
        const requestTime = time;

        // Find the busy blocks for the requested date
        const daySchedule = pattern.busyBlocks.find(block => 
            block.date.toDateString() === requestDate.toDateString()
        );

        if (!daySchedule) {
            return res.json({ 
                isAvailable: true, 
                message: 'No scheduled events for this day' 
            });
        }

        // Check if the requested time falls within any busy blocks
        const isBusy = daySchedule.blocks.some(block => 
            requestTime >= block.startTime && requestTime < block.endTime
        );

        // Find next available time if busy
        let message;
        if (isBusy) {
            const currentBlock = daySchedule.blocks.find(block => 
                requestTime >= block.startTime && requestTime < block.endTime
            );
            message = `Not available at this time. Next available time is at ${currentBlock.endTime}`;
        } else {
            const nextBusyBlock = daySchedule.blocks.find(block => 
                block.startTime > requestTime
            );
            message = nextBusyBlock 
                ? `Available until ${nextBusyBlock.startTime}`
                : 'Available for the rest of the day';
        }

        res.json({
            isAvailable: !isBusy,
            message
        });
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper functions
function getTimeOfDay(hour) {
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

function getBusyPeriods(blocks) {
    return blocks
        .filter(block => block.status === 'busy')
        .map(block => ({
            period: getTimeOfDay(block.startTime),
            startTime: block.startTime,
            endTime: block.endTime
        }));
}

function generateAvailabilityMessage(busyPeriods) {
    if (busyPeriods.length === 0) return "Available all day";
    
    const periods = busyPeriods.map(p => p.period);
    if (periods.length === 3) return "Busy all day";
    
    const busyTimes = periods.join(' and ');
    return `Busy during the ${busyTimes}`;
}

// Handle calendar disconnection
router.post('/disconnect', verifyToken, async (req, res) => {
    try {
        const user = await mongoose.model('User').findOne({ username: req.user.username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete the calendar pattern document instead of just marking it as disconnected
        await CalendarPattern.findOneAndDelete({ userId: user._id });

        res.json({ message: 'Calendar disconnected successfully' });
    } catch (error) {
        console.error('Error disconnecting calendar:', error);
        res.status(500).json({ message: 'Error disconnecting calendar' });
    }
});

// Get user's calendar availability patterns
router.get('/availability/:username', async (req, res) => {
    try {
        const user = await mongoose.model('User').findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const calendarPattern = await CalendarPattern.findOne({ 
            userId: user._id,
            isConnected: true
        });

        if (!calendarPattern) {
            return res.status(404).json({ message: 'Calendar not connected' });
        }

        // Calculate availability insights
        const busyHoursArray = calendarPattern.busyHours;
        const busyDaysArray = calendarPattern.busyDays;
        
        const bestHours = busyHoursArray
            .map((count, hour) => ({ hour, count }))
            .sort((a, b) => a.count - b.count)
            .slice(0, 3)
            .map(item => ({
                hour: item.hour,
                period: item.hour < 12 ? 'AM' : 'PM',
                displayHour: item.hour % 12 || 12
            }));

        const busiestDays = busyDaysArray
            .map((count, day) => ({ day, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map(item => ({
                day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][item.day]
            }));

        const avgDuration = Math.round(calendarPattern.averageDuration);

        const availability = {
            bestMeetingTimes: bestHours,
            busiestDays: busiestDays,
            averageMeetingDuration: avgDuration,
            lastAnalyzed: calendarPattern.lastAnalyzed
        };

        res.json(availability);
    } catch (error) {
        console.error('Error fetching calendar availability:', error);
        res.status(500).json({ message: 'Error fetching calendar availability' });
    }
});

// Get busy blocks for a specific date
router.get('/busy-blocks/:username', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required' });
        }

        console.log('Looking up calendar for:', {
            username: req.params.username,
            requestedDate: date
        });

        const user = await mongoose.model('User').findOne({ username: req.params.username });
        if (!user) {
            console.log('User not found:', req.params.username);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('Found user:', {
            username: user.username,
            userId: user._id
        });

        const pattern = await CalendarPattern.findOne({ userId: user._id });
        if (!pattern || !pattern.isConnected) {
            console.log('Calendar pattern not found or not connected for user:', user._id);
            return res.status(404).json({ error: 'Calendar not connected' });
        }

        const requestDate = new Date(date);
        // Convert request date to YYYY-MM-DD format for comparison
        const requestDateStr = requestDate.toISOString().split('T')[0];

        // Find busy blocks for the requested date
        const daySchedule = pattern.busyBlocks.find(block => {
            // Convert block date to YYYY-MM-DD format for comparison
            const blockDateStr = new Date(block.date).toISOString().split('T')[0];
            return blockDateStr === requestDateStr;
        });

        console.log('Day schedule found:', daySchedule ? {
            date: daySchedule.date,
            numberOfBlocks: daySchedule.blocks.length
        } : 'No schedule found for this day');

        if (!daySchedule) {
            return res.json({ 
                date: date,
                busyBlocks: [],
                message: 'No scheduled events for this day'
            });
        }

        res.json({
            date: date,
            busyBlocks: daySchedule.blocks,
            message: `Found ${daySchedule.blocks.length} events for this day`
        });
    } catch (error) {
        console.error('Error fetching busy blocks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = {
    router,
    CalendarPattern
}; 