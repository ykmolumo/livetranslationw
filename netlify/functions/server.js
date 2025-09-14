const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Create Express app
const app = express();
const server = http.createServer(app);

// CORS configuration for Netlify
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://live-translation-app.netlify.app", "https://*.netlify.app"]
            : ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store rooms and users
const rooms = new Map();
const userSessions = new Map();

// Translation services (same as original)
async function translateWithLibreTranslate(text, sourceLang, targetLang) {
    try {
        const response = await fetch('https://libretranslate.de/translate', {
            method: 'POST',
            body: JSON.stringify({
                q: text,
                source: sourceLang,
                target: targetLang,
                format: 'text'
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`LibreTranslate error: ${response.status}`);
        
        const data = await response.json();
        return data.translatedText;
    } catch (error) {
        console.warn('LibreTranslate failed:', error.message);
        throw error;
    }
}

async function translateWithMyMemory(text, sourceLang, targetLang) {
    try {
        const langPair = `${sourceLang}|${targetLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`MyMemory error: ${response.status}`);
        
        const data = await response.json();
        if (data.responseStatus === 200) {
            return data.responseData.translatedText;
        }
        throw new Error('MyMemory translation failed');
    } catch (error) {
        console.warn('MyMemory failed:', error.message);
        throw error;
    }
}

async function translateWithLingva(text, sourceLang, targetLang) {
    try {
        const url = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Lingva error: ${response.status}`);
        
        const data = await response.json();
        return data.translation;
    } catch (error) {
        console.warn('Lingva failed:', error.message);
        throw error;
    }
}

async function translateWithFreeServices(text, sourceLang, targetLang) {
    const services = [
        () => translateWithLibreTranslate(text, sourceLang, targetLang),
        () => translateWithMyMemory(text, sourceLang, targetLang),
        () => translateWithLingva(text, sourceLang, targetLang)
    ];
    
    for (const service of services) {
        try {
            const result = await service();
            if (result) return result;
        } catch (error) {
            console.warn('Translation service failed, trying next:', error.message);
        }
    }
    
    throw new Error('All translation services failed');
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (data) => {
        const { roomId, userName, userLanguage } = data;
        
        // Leave previous room if any
        if (userSessions.has(socket.id)) {
            const prevSession = userSessions.get(socket.id);
            socket.leave(prevSession.roomId);
            
            if (rooms.has(prevSession.roomId)) {
                const room = rooms.get(prevSession.roomId);
                room.users.delete(socket.id);
                
                socket.to(prevSession.roomId).emit('user-left', {
                    userName: prevSession.userName,
                    userId: socket.id
                });
                
                if (room.users.size === 0) {
                    rooms.delete(prevSession.roomId);
                }
            }
        }

        // Join new room
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                users: new Map(),
                createdAt: new Date()
            });
        }
        
        const room = rooms.get(roomId);
        const userInfo = { userName, userLanguage, joinedAt: new Date() };
        room.users.set(socket.id, userInfo);
        
        userSessions.set(socket.id, {
            roomId,
            userName,
            userLanguage
        });

        // Send room info to user
        socket.emit('room-joined', {
            roomId,
            users: Array.from(room.users.entries()).map(([id, info]) => ({
                id,
                name: info.userName,
                language: info.userLanguage
            }))
        });

        // Notify others
        socket.to(roomId).emit('user-joined', {
            userName,
            userLanguage,
            userId: socket.id
        });

        console.log(`User ${userName} joined room ${roomId}`);
    });

    socket.on('live-speech', async (data) => {
        try {
            const session = userSessions.get(socket.id);
            if (!session) return;

            const { text, sourceLanguage } = data;
            const room = rooms.get(session.roomId);
            if (!room) return;

            // Translate for each user in different languages
            for (const [userId, userInfo] of room.users) {
                if (userId === socket.id) continue; // Skip sender
                
                if (userInfo.userLanguage !== sourceLanguage) {
                    try {
                        const translatedText = await translateWithFreeServices(
                            text, 
                            sourceLanguage, 
                            userInfo.userLanguage
                        );
                        
                        io.to(userId).emit('live-translation', {
                            originalText: text,
                            translatedText,
                            speakerName: session.userName,
                            sourceLanguage,
                            targetLanguage: userInfo.userLanguage,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        console.error('Translation failed for user:', userId, error);
                        io.to(userId).emit('live-translation', {
                            originalText: text,
                            translatedText: text, // Fallback to original
                            speakerName: session.userName,
                            sourceLanguage,
                            targetLanguage: userInfo.userLanguage,
                            timestamp: new Date().toISOString(),
                            error: 'Translation failed'
                        });
                    }
                } else {
                    // Same language, send original
                    io.to(userId).emit('new-message', {
                        originalText: text,
                        speakerName: session.userName,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } catch (error) {
            console.error('Live speech error:', error);
            socket.emit('error', { message: 'Failed to process speech' });
        }
    });

    socket.on('conversation-message', async (data) => {
        try {
            const session = userSessions.get(socket.id);
            if (!session) return;

            const { text, messageType } = data;
            const room = rooms.get(session.roomId);
            if (!room) return;

            // Broadcast to room (same logic as live-speech)
            for (const [userId, userInfo] of room.users) {
                if (userId === socket.id) continue;
                
                if (userInfo.userLanguage !== session.userLanguage) {
                    try {
                        const translatedText = await translateWithFreeServices(
                            text, 
                            session.userLanguage, 
                            userInfo.userLanguage
                        );
                        
                        io.to(userId).emit('live-translation', {
                            originalText: text,
                            translatedText,
                            speakerName: session.userName,
                            sourceLanguage: session.userLanguage,
                            targetLanguage: userInfo.userLanguage,
                            timestamp: new Date().toISOString(),
                            messageType
                        });
                    } catch (error) {
                        console.error('Message translation failed:', error);
                    }
                } else {
                    io.to(userId).emit('new-message', {
                        originalText: text,
                        speakerName: session.userName,
                        timestamp: new Date().toISOString(),
                        messageType
                    });
                }
            }
        } catch (error) {
            console.error('Conversation message error:', error);
        }
    });

    socket.on('change-language', (data) => {
        const session = userSessions.get(socket.id);
        if (!session) return;

        const { language } = data;
        const oldLanguage = session.userLanguage;
        session.userLanguage = language;

        const room = rooms.get(session.roomId);
        if (room && room.users.has(socket.id)) {
            room.users.get(socket.id).userLanguage = language;
            
            socket.to(session.roomId).emit('user-language-changed', {
                userName: session.userName,
                userId: socket.id,
                oldLanguage,
                newLanguage: language
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const session = userSessions.get(socket.id);
        if (session) {
            const room = rooms.get(session.roomId);
            if (room) {
                room.users.delete(socket.id);
                
                socket.to(session.roomId).emit('user-left', {
                    userName: session.userName,
                    userId: socket.id
                });
                
                if (room.users.size === 0) {
                    rooms.delete(session.roomId);
                    console.log(`Room ${session.roomId} deleted (empty)`);
                }
            }
            
            userSessions.delete(socket.id);
        }
    });
});

// API Routes
app.get('/api/room/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = rooms.get(roomId);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
        roomId,
        userCount: room.users.size,
        users: Array.from(room.users.entries()).map(([id, info]) => ({
            id,
            name: info.userName,
            language: info.userLanguage,
            joinedAt: info.joinedAt
        })),
        createdAt: room.createdAt
    });
});

app.post('/api/room', (req, res) => {
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    
    rooms.set(roomId, {
        id: roomId,
        users: new Map(),
        createdAt: new Date()
    });
    
    res.json({ roomId });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        users: userSessions.size
    });
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// For Netlify Functions
const port = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    server.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

module.exports = { app, server, io };
