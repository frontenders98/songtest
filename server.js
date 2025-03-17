const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

// Middleware for static files and caching
app.use(express.static(__dirname, { maxAge: '1d' }));
app.use('/uploads', express.static('uploads', { maxAge: '1d' }));

// Session middleware
app.use(session({
    secret: 'your-secret-key', // Change this to something unique!
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const clientSessionId = req.headers['x-session-id'] || req.session.id;
        const uploadDir = `./uploads/${clientSessionId}`;
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024, files: 500 } // 50MB per file, 500 files max
}).array('songs');

// Endpoint to get songs list
app.get('/songs', (req, res) => {
    const clientSessionId = req.headers['x-session-id'] || req.session.id;
    const songsFile = `songs-${clientSessionId}.json`;
    if (!fs.existsSync(songsFile)) {
        return res.json([]); // Return empty array if no songs yet
    }
    try {
        const songs = JSON.parse(fs.readFileSync(songsFile, 'utf8'));
        const uniqueSongs = Array.from(new Map(songs.map(song => [song.title.toLowerCase(), song])).values());
        res.json(uniqueSongs);
    } catch (err) {
        console.error('Error reading songs file:', err);
        res.status(500).json([]);
    }
});

// Endpoint to handle song uploads
app.post('/upload', (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ error: 'Upload failed' });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        const clientSessionId = req.headers['x-session-id'] || req.session.id;
        const songsFile = `songs-${clientSessionId}.json`;
        let songs = [];
        if (fs.existsSync(songsFile)) {
            try {
                songs = JSON.parse(fs.readFileSync(songsFile, 'utf8'));
            } catch (e) {
                console.error('Error parsing existing songs file:', e);
            }
        }
        const newSongs = req.files.map(file => ({
            title: file.originalname.replace('.mp3', ''),
            file: `${clientSessionId}/${file.filename}` // Relative path for playback
        }));
        newSongs.forEach(newSong => {
            if (!songs.some(song => song.title.toLowerCase() === newSong.title.toLowerCase())) {
                songs.push(newSong);
            }
        });
        try {
            fs.writeFileSync(songsFile, JSON.stringify(songs, null, 2));
            const uniqueSongs = Array.from(new Map(songs.map(song => [song.title.toLowerCase(), song])).values());
            res.json(uniqueSongs);
        } catch (err) {
            console.error('Error writing songs file:', err);
            res.status(500).json([]);
        }
    });
});

// Root URL redirects to play.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'play.html'));
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});