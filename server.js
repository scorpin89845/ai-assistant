import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { AIAssistant } from './ai_assistant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// Create AI Assistant instance
const assistant = new AIAssistant();

// Parse JSON bodies
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle commands from the web interface
app.post('/command', async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }

        // Process the command using our AI assistant
        await assistant.processCommand(command);
        
        // For now, we'll send a simple response
        res.json({ success: true });
    } catch (error) {
        console.error('Error processing command:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
