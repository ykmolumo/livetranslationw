const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Translation API endpoint using free services
app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;
    
    // Use free translation services with fallbacks
    let translation = await translateWithFreeServices(text, sourceLanguage, targetLanguage);
    
    res.json({
      success: true,
      originalText: text,
      translatedText: translation,
      sourceLanguage: sourceLanguage || 'auto',
      targetLanguage,
      service: 'free'
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      success: false,
      error: 'Translation failed',
      message: error.message
    });
  }
});

// Free translation service with multiple fallbacks
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

// LibreTranslate (Free, self-hosted option)
async function translateWithLibreTranslate(text, sourceLang, targetLang) {
  const axios = require('axios');
  
  try {
    const response = await axios.post('https://libretranslate.de/translate', {
      q: text,
      source: sourceLang === 'auto' ? 'auto' : sourceLang,
      target: targetLang,
      format: 'text'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    return response.data.translatedText;
  } catch (error) {
    throw new Error('LibreTranslate failed');
  }
}

// MyMemory (Free translation API)
async function translateWithMyMemory(text, sourceLang, targetLang) {
  const axios = require('axios');
  
  try {
    const langPair = `${sourceLang === 'auto' ? 'en' : sourceLang}|${targetLang}`;
    const response = await axios.get('https://api.mymemory.translated.net/get', {
      params: {
        q: text,
        langpair: langPair
      },
      timeout: 10000
    });
    
    if (response.data.responseStatus === 200) {
      return response.data.responseData.translatedText;
    }
    throw new Error('MyMemory API error');
  } catch (error) {
    throw new Error('MyMemory failed');
  }
}

// Lingva Translate (Free Google Translate proxy)
async function translateWithLingva(text, sourceLang, targetLang) {
  const axios = require('axios');
  
  try {
    const source = sourceLang === 'auto' ? 'auto' : sourceLang;
    const response = await axios.get(`https://lingva.ml/api/v1/${source}/${targetLang}/${encodeURIComponent(text)}`, {
      timeout: 10000
    });
    
    return response.data.translation;
  } catch (error) {
    throw new Error('Lingva failed');
  }
}

// Store active rooms and users
const activeRooms = new Map();
const userSessions = new Map();

// Socket.IO for real-time communication
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join or create a conversation room
  socket.on('join-room', (data) => {
    const { roomId, userName, userLanguage } = data;
    
    // Leave any existing room
    if (userSessions.has(socket.id)) {
      const oldRoom = userSessions.get(socket.id).roomId;
      socket.leave(oldRoom);
      updateRoomUsers(oldRoom, socket.id, 'leave');
    }
    
    // Join new room
    socket.join(roomId);
    
    // Store user session
    userSessions.set(socket.id, {
      roomId,
      userName: userName || `User${Math.floor(Math.random() * 1000)}`,
      userLanguage: userLanguage || 'en',
      joinedAt: new Date().toISOString()
    });
    
    // Update room info
    updateRoomUsers(roomId, socket.id, 'join');
    
    // Notify room about new user
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userName: userSessions.get(socket.id).userName,
      userLanguage: userLanguage,
      timestamp: new Date().toISOString()
    });
    
    // Send current room info to new user
    socket.emit('room-joined', {
      roomId,
      users: getRoomUsers(roomId),
      message: 'Connected to conversation room'
    });
    
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Handle real-time speech translation
  socket.on('live-speech', async (data) => {
    try {
      const userSession = userSessions.get(socket.id);
      if (!userSession) return;
      
      const { text, isInterim, targetLanguages } = data;
      const sourceLanguage = userSession.userLanguage;
      
      // Broadcast to room members with their preferred languages
      const roomUsers = getRoomUsers(userSession.roomId);
      
      for (const [userId, userInfo] of roomUsers) {
        if (userId === socket.id) continue; // Don't send to self
        
        const targetLang = userInfo.userLanguage;
        if (targetLang === sourceLanguage) continue; // Same language
        
        try {
          // Translate to target user's language
          const translation = await translateWithFreeServices(text, sourceLanguage, targetLang);
          
          // Send translation to specific user
          socket.to(userId).emit('live-translation', {
            originalText: text,
            translatedText: translation,
            sourceLanguage,
            targetLanguage: targetLang,
            speakerName: userSession.userName,
            speakerId: socket.id,
            isInterim,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Translation error for user', userId, error);
        }
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to process live speech' });
    }
  });

  // Handle conversation messages
  socket.on('conversation-message', async (data) => {
    try {
      const userSession = userSessions.get(socket.id);
      if (!userSession) return;
      
      const { text, messageType } = data; // messageType: 'speech' or 'text'
      const sourceLanguage = userSession.userLanguage;
      
      // Broadcast to all room members
      socket.to(userSession.roomId).emit('new-message', {
        messageId: Date.now(),
        originalText: text,
        sourceLanguage,
        speakerName: userSession.userName,
        speakerId: socket.id,
        messageType,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle language preference changes
  socket.on('change-language', (data) => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      userSession.userLanguage = data.language;
      
      // Notify room about language change
      socket.to(userSession.roomId).emit('user-language-changed', {
        userId: socket.id,
        userName: userSession.userName,
        newLanguage: data.language,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      // Notify room about user leaving
      socket.to(userSession.roomId).emit('user-left', {
        userId: socket.id,
        userName: userSession.userName,
        timestamp: new Date().toISOString()
      });
      
      // Clean up
      updateRoomUsers(userSession.roomId, socket.id, 'leave');
      userSessions.delete(socket.id);
    }
    
    console.log('User disconnected:', socket.id);
  });
});

// Helper functions for room management
function updateRoomUsers(roomId, userId, action) {
  if (!activeRooms.has(roomId)) {
    activeRooms.set(roomId, new Map());
  }
  
  const room = activeRooms.get(roomId);
  
  if (action === 'join') {
    const userSession = userSessions.get(userId);
    if (userSession) {
      room.set(userId, {
        userName: userSession.userName,
        userLanguage: userSession.userLanguage,
        joinedAt: userSession.joinedAt
      });
    }
  } else if (action === 'leave') {
    room.delete(userId);
    
    // Clean up empty rooms
    if (room.size === 0) {
      activeRooms.delete(roomId);
    }
  }
}

function getRoomUsers(roomId) {
  return activeRooms.get(roomId) || new Map();
}

// API endpoint to get room info
app.get('/api/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  const roomUsers = getRoomUsers(roomId);
  
  res.json({
    success: true,
    roomId,
    userCount: roomUsers.size,
    users: Array.from(roomUsers.entries()).map(([id, info]) => ({
      id,
      name: info.userName,
      language: info.userLanguage,
      joinedAt: info.joinedAt
    }))
  });
});

// API endpoint to create/join room with shareable link
app.post('/api/create-room', (req, res) => {
  const roomId = req.body.roomId || generateRoomId();
  
  res.json({
    success: true,
    roomId,
    shareLink: `${req.protocol}://${req.get('host')}/?room=${roomId}`,
    message: 'Room created successfully'
  });
});

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌍 Live Translation Server running on port ${PORT}`);
  console.log(`📱 Access the app at: http://localhost:${PORT}`);
  console.log(`🔗 Create conversation rooms by adding ?room=ROOMID to the URL`);
});
