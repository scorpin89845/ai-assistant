import { Builder, By, Key, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import gTTS from 'node-gtts';
import open from 'open';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createInterface } from 'readline';
import { promisify } from 'util';
import { exec } from 'child_process';
import axios from 'axios';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AIAssistant {
    constructor() {
        this.running = false;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.lastYoutubeSearch = null;
        this.driver = null;
        this.ollamaEndpoint = 'http://localhost:11434/api/generate';
        
        // Clean up any existing audio files on start
        this.cleanupAudioFiles();
        
        this.websites = {
            "Google": "https://www.google.com",
            "YouTube": "https://www.youtube.com",
            "Facebook": "https://www.facebook.com",
            "Twitter": "https://www.twitter.com",
            "Instagram": "https://www.instagram.com",
            "Amazon": "https://www.amazon.com",
            "Netflix": "https://www.netflix.com",
            "Gmail": "https://www.gmail.com",
            "Google Maps": "https://www.google.com/maps",
            "Wikipedia": "https://www.wikipedia.org",
            "GitHub": "https://www.github.com",
            "Netlify": "https://app.netlify.com"
        };
    }

    async initDriver() {
        if (!this.driver) {
            const options = new chrome.Options();
            options.addArguments('--start-maximized');
            options.addArguments('--disable-notifications');
            
            this.driver = await new Builder()
                .forBrowser('chrome')
                .setChromeOptions(options)
                .build();
        }
    }

    cleanupAudioFiles() {
        const files = fs.readdirSync(__dirname);
        for (const file of files) {
            if (file.startsWith('output_') && file.endsWith('.mp3')) {
                try {
                    fs.unlinkSync(path.join(__dirname, file));
                } catch (err) {
                    // Ignore errors during cleanup
                }
            }
        }
    }

    async playAudio(mp3File) {
        return new Promise(async (resolve) => {
            try {
                // Try to find VLC in common installation paths
                const vlcPaths = [
                    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
                    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'
                ];
                
                let vlcPath = null;
                for (const path of vlcPaths) {
                    if (fs.existsSync(path)) {
                        vlcPath = path;
                        break;
                    }
                }
                
                if (!vlcPath) {
                    console.log('VLC not found. Please install VLC media player.');
                    resolve();
                    return;
                }
                
                // Use VLC to play the audio
                const command = `"${vlcPath}" "${mp3File}" --play-and-exit --intf dummy`;
                await execAsync(command);
                
                // Delete the file after playing
                try {
                    fs.unlinkSync(mp3File);
                } catch (err) {
                    console.error('Error cleaning up file:', err);
                }
                resolve();
            } catch (error) {
                console.error('Error playing audio:', error);
                resolve();
            }
        });
    }

    async speak(text) {
        return new Promise((resolve, reject) => {
            console.log(`Assistant: ${text}`);
            
            // Generate a unique filename for this speech
            const timestamp = Date.now();
            const filename = path.join(__dirname, `output_${timestamp}.mp3`);
            
            // Create gTTS instance with 'hi' (Hindi) language
            const gtts = new gTTS('hi');
            
            // Save the speech
            gtts.save(filename, text, async (err) => {
                if (err) {
                    console.error('Error saving speech:', err);
                    reject(err);
                    return;
                }
                
                try {
                    // Wait for file to be ready
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Play the audio
                    await this.playAudio(filename);
                    resolve();
                } catch (error) {
                    console.error('Error in audio playback:', error);
                    reject(error);
                }
            });
        });
    }

    async askOllama(question) {
        try {
            const hindiPrompt = `Please respond in Hindi language (using Devanagari script) to this question: ${question}. 
                               Make sure to write the full response in proper Hindi.`;
            
            const response = await axios.post(this.ollamaEndpoint, {
                model: 'llama3.2',
                prompt: hindiPrompt,
                stream: false
            });
            
            if (response.data && response.data.response) {
                await this.speak(response.data.response);
            } else {
                await this.speak("माफ़ कीजिए, मुझे Ollama से कोई जवाब नहीं मिला।");
            }
        } catch (error) {
            console.error('Error calling Ollama:', error);
            if (error.code === 'ECONNREFUSED') {
                await this.speak("कृपया सुनिश्चित करें कि Ollama सर्वर चालू है और localhost:11434 पर चल रहा है।");
            } else {
                await this.speak("माफ़ कीजिए, Ollama से संपर्क करने में कोई समस्या आई है।");
            }
        }
    }

    async listen() {
        console.log("Listening... (Type your command)");
        
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve) => {
            rl.question('You: ', (command) => {
                rl.close();
                resolve(command.toLowerCase());
            });
        });
    }

    async openWebsite(websiteName) {
        try {
            if (this.websites[websiteName]) {
                await open(this.websites[websiteName]);
            } else {
                await open(`https://www.${websiteName.toLowerCase()}.com`);
            }
            await this.speak(`Opening ${websiteName}`);
        } catch (error) {
            console.error(`Error opening website: ${error}`);
            await this.speak("Sorry, I couldn't open the website");
        }
    }

    async searchGoogle(query) {
        try {
            await open(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
            await this.speak(`Searching for ${query}`);
        } catch (error) {
            console.error(`Error searching Google: ${error}`);
            await this.speak("Sorry, I couldn't perform the search");
        }
    }

    async playYouTubeVideo(query) {
        try {
            await this.initDriver();
            
            // Navigate to YouTube
            await this.driver.get('https://www.youtube.com');
            
            // Find and interact with search box
            const searchBox = await this.driver.findElement(By.name('search_query'));
            await searchBox.clear();
            await searchBox.sendKeys(query, Key.RETURN);
            
            // Wait for search results and click the first video
            await this.driver.wait(until.elementLocated(By.css('ytd-video-renderer')), 5000);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for results to load
            
            const firstVideo = await this.driver.findElement(By.css('ytd-video-renderer'));
            await firstVideo.click();
            
            await this.speak(`Playing ${query} on YouTube`);
        } catch (error) {
            console.error(`Error playing YouTube video: ${error}`);
            await this.speak("Sorry, I couldn't play the video");
            
            // Try to close the driver on error
            if (this.driver) {
                try {
                    await this.driver.quit();
                    this.driver = null;
                } catch (e) {
                    console.error('Error closing driver:', e);
                }
            }
        }
    }

    async processCommand(command) {
        if (!command) return;

        try {
            if (command.startsWith("ollama")) {
                // Extract the question after "ollama"
                const question = command.substring("ollama".length).trim();
                if (question) {
                    await this.askOllama(question);
                } else {
                    await this.speak("Please provide a question after 'ollama'");
                }
            }
            else if (command.startsWith("open")) {
                const site = command.replace("open", "").trim();
                await this.openWebsite(site);
            }
            else if (command.includes("youtube") || (command.includes("play") && 
                (command.includes("song") || command.includes("video") || command.includes("music")))) {
                const query = command.includes("play") ? 
                    command.split("play")[1].trim() : 
                    command.split("youtube")[1].trim();
                
                if (!query) {
                    await this.speak("What would you like me to play?");
                    return;
                }
                
                await this.playYouTubeVideo(query);
            }
            else if (command.includes("search")) {
                const query = command.replace("search", "").trim();
                await this.searchGoogle(query);
            }
            else if (command.includes("exit") || command.includes("quit") || command.includes("goodbye")) {
                await this.speak("Goodbye");
                this.stop();
            }
            else if (command.includes("what is your name") || command.includes("who are you")) {
                await this.speak("नमस्ते। मेरा नाम इको है। मैं एक एआई असिस्टेंट हूं।");
            }
            else {
                await this.speak("मैं आपकी बात समझ नहीं पाया। कृपया दोबारा कहें।");
            }
        } catch (error) {
            console.error(`Error processing command: ${error}`);
            await this.speak("Sorry, an error occurred while processing your command.");
        }
    }

    async run() {
        this.running = true;
        await this.speak("नमस्ते Sir.");

        while (this.running) {
            try {
                const command = await this.listen();
                if (command) {
                    await this.processCommand(command);
                }
            } catch (error) {
                console.error(`Error in main loop: ${error}`);
                await this.speak("Sorry, an error occurred. Please try again.");
            }
        }
    }

    async stop() {
        this.running = false;
        // Clean up any remaining audio files
        this.cleanupAudioFiles();
        
        // Close the browser if it's open
        if (this.driver) {
            try {
                await this.driver.quit();
            } catch (e) {
                console.error('Error closing browser:', e);
            }
        }
        
        process.exit(0);
    }
}

// Export the AIAssistant class
export { AIAssistant };

// Only create and run the assistant if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const assistant = new AIAssistant();
    assistant.run();
}
