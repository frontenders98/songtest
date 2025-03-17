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
    secret: 'XTC9nBPVsF', // Change this!
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
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024, files: 500 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'audio/mpeg') {
            cb(null, true);
        } else {
            cb(null, false); // Silently skip non-MP3 files
        }
    }
}).array('songs');

app.get('/songs', (req, res) => {
    const clientSessionId = req.headers['x-session-id'] || req.session.id;
    const songsFile = `songs-${clientSessionId}.json`;
    if (!fs.existsSync(songsFile)) {
        return res.json([]);
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

        newSongs.forEach(newSong => {
            if (!songs.some(song => song.title.toLowerCase() === newSong.title.toLowerCase())) {
                songs.push(newSong);
            }
        });

        try {
            fs.writeFileSync(songsFile, JSON.stringify(songs, null, 2));
            const uniqueSongs = Array.from(new Map(songs.map(song => [song.title.toLowerCase(), song])).values());
            res.json(uniqueSongs); // Respond immediately after writing
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