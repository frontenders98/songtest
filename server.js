const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname, { maxAge: '1d' }));
app.use('/uploads', express.static('uploads', { maxAge: '1d' }));

app.use(session({
    secret: 'XTC9nBPVsF', // Keep your secret!
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if HTTPS
}));

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
        cb(null, `${Date.now()}-${file.originalname}`); // Unique filenames on disk
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024, files: 1000 }, // Up to 1000 files
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'audio/mpeg') {
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
}).array('songs', 1000);

// Get songs endpoint
app.get('/songs', (req, res) => {
    const clientSessionId = req.headers['x-session-id'] || req.session.id;
    const songsFile = `songs-${clientSessionId}.json`;
    if (!fs.existsSync(songsFile)) {
        return res.json([]);
    }
    try {
        const songs = JSON.parse(fs.readFileSync(songsFile, 'utf8'));
        res.json(songs); // Return all songs
    } catch (err) {
        console.error('Error reading songs file:', err);
        res.status(500).json([]);
    }
});

// Upload songs endpoint
app.post('/upload', (req, res) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: 'Upload failed: Too many files or file too large' });
        } else if (err) {
            console.error('Unexpected error:', err);
            return res.status(500).json({ error: 'Upload failed: Server error' });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No valid MP3 files uploaded' });
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
            file: `${clientSessionId}/${file.filename}`
        }));

        // Filter out duplicates based on original filename (title)
        const uniqueNewSongs = newSongs.filter(newSong => 
            !songs.some(existing => existing.title === newSong.title)
        );

        // Add only unique new songs
        songs = [...songs, ...uniqueNewSongs];

        try {
            fs.writeFileSync(songsFile, JSON.stringify(songs, null, 2));
            console.log(`Total songs: ${songs.length}, New songs added: ${uniqueNewSongs.length}`);
            res.json(songs); // Return updated list
        } catch (err) {
            console.error('Error writing songs file:', err);
            res.status(500).json({ error: 'Failed to save songs' });
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'play.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});