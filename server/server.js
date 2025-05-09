// server.js

const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

//problem set
const json = JSON.parse(fs.readFileSync('./problems.json', 'utf-8'));
const problems = json.data.problemsetQuestionList.questions;

const app = express();
app.use(cors());

// API endpoint to get all problems
app.get('/api/problems', (req, res) => {
  res.json(problems);
});

// API endpoint for search functionality
app.get('/api/problems/search', (req, res) => {
  const query = req.query.q || ''; // Search query from the frontend
  const filteredProblems = problems.filter(problem => {
    return problem.title.toLowerCase().includes(query.toLowerCase());
  });
  res.json(filteredProblems);
});



const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, specify your frontend domain
    methods: ["GET", "POST"]
  }
});

// Store active rooms
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new room
  socket.on('create-room', (data) => {
    console.log('Create room data received:', data);
    const roomId = uuidv4().substring(0, 8);
    rooms[roomId] = {
      code: '// Start coding here...',
      language: 'javascript',
      users: {}
    };
    rooms[roomId].users[socket.id] = {
      username: data.username,
      role: data.role
    };
    console.log('User role stored in room:', data.role);
    
    socket.join(roomId);
    socket.emit('room-joined', {
      roomId,
      initialCode: rooms[roomId].code,
      role: data.role
    });
    
    console.log(`Room created: ${roomId} by ${data.username}`);
  });

  // Join an existing room
  socket.on('join-room', (data) => {
    const { roomId, username } = data;
    
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Add user to room
    rooms[roomId].users[socket.id] = {
      username: username,
      role: data.role
    };
    socket.join(roomId);
    
    // Notify user they've joined
    socket.emit('room-joined', {
      roomId,
      initialCode: rooms[roomId].code,
      language: rooms[roomId].language,
      role: data.role
    });
    
     // Send the joining user information about all existing users
    Object.entries(rooms[roomId].users).forEach(([userId, userData]) => {
      // Don't send user their own information
      if (userId !== socket.id) {
        socket.emit('user-joined', {
          username: userData.username,
          userId: userId,
          role: userData.role
        });
      }
    });

    // Notify others in the room
    socket.to(roomId).emit('user-joined', {
      username,
      userId: socket.id,
      role: data.role
    });
    
    console.log(`${username} joined room: ${roomId}`);
  });

  // Handle code updates
  socket.on('code-update', (data) => {
    const { roomId, code } = data;
    
    if (rooms[roomId]) {
      rooms[roomId].code = code;
      socket.to(roomId).emit('code-update', { code });
    }
  });

  // Handle problem selection
  socket.on('question-selected', (data) => {
    const { roomId, problem } = data;
  
    if (rooms[roomId]) {
      // Store the problem in the room (can be null when problem is cleared)
      rooms[roomId].problem = problem;
      
      if (problem === null) {
        console.log(`Problem selection cleared in room ${roomId}`);
      } else {
        console.log(`Problem selected in room ${roomId}:`, problem.difficulty || 'Untitled problem');
      }
  
      // Broadcast the problem to all users in the room (except the sender)
      socket.to(roomId).emit('question-selected', { problem });
    }
  });


  // Handle language changes
  socket.on('language-change', (data) => {
    const { roomId, language } = data;
    
    if (rooms[roomId]) {
      rooms[roomId].language = language;
      socket.to(roomId).emit('language-change', { language });
    }
  });

  // Handle chat messages
  socket.on('chat-message', (data) => {
    const { roomId, username, message } = data;
    
    socket.to(roomId).emit('chat-message', {
      username,
      message
    });
  });

  // Handle code running
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find which room this user was in
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const userData = rooms[roomId].users[socket.id];
        
        // Notify others in the room
        socket.to(roomId).emit('user-left', {
          username: userData.username,
          userId: socket.id
        });
        
        // Remove user from room
        delete rooms[roomId].users[socket.id];
        
        // If room is empty, delete it
        if (Object.keys(rooms[roomId].users).length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        }
        
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});