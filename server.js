import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';  // For sending push notifications

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',  // Adjust this if necessary
  },
});

// Store user connections with socket IDs and expo tokens
const userSockets = {}; // { user_id: { socketId: socket.id, expoTokenPush: 'token', username: 'username' } }

// Temporary in-memory storage for swipes (and Expo push tokens)
const swipes = {}; // { item_id: { user_id: { interested: true, partner_id: ..., expoPushToken: 'token' } } }

// Function to send push notifications via Expo Push API
const sendPushNotification = async (expoTokenPush, message) => {
  const notificationMessage = {
    to: expoTokenPush,
    sound: 'default',
    title: 'New Match!',
    body: message,
    data: { someData: 'Match Details' },
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notificationMessage),
    });

    const responseData = await response.json();
    console.log('Push notification response:', responseData);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Listen for user login event to map user_id to socket.id and store expoPushToken and username
  socket.on('registerUser', ({ user_id, expoPushToken, username }) => {
    userSockets[user_id] = { socketId: socket.id, expoPushToken, username }; // Map user_id to socket ID, store expoPushToken and username
    console.log(`User registered: ${user_id} with socket ID: ${socket.id}, Expo Push Token: ${expoPushToken}, and username: ${username}`);
  });

  // Listen for couple swipes
  socket.on('coupleSwipe', (swipeData) => {
    const { user_id, partner_id, interested, id: item_id, expoPushToken, partner_username, user_username, item_type } = swipeData;

    console.log('Received coupleSwipe:', { user_id, partner_id, interested, item_id, expoPushToken, partner_username, item_type });

    if (!user_id || !partner_id || !item_id) {
      console.error('Invalid swipe data:', swipeData);
      return;
    }

    // Store the swipe data with Expo push token in memory
    if (!swipes[item_id]) {
      swipes[item_id] = {};
    }
    swipes[item_id][user_id] = { interested, partner_id, expoPushToken };

    const partnerSwipe = swipes[item_id][partner_id];

    if (partnerSwipe && partnerSwipe.interested && interested) {
      console.log(`Match detected: User ${user_id} matched with ${partner_id} on item ${item_id}`);

      // Get the title and image based on item_type
      // Get the title and image based on item_type
      let title = '';
      let image = '';

      switch (item_type) {
        case 'movies':
          title = swipeData?.title || 'Unknown Movie';
          image = swipeData?.image || '';
          break;
        case 'shows':
          title = swipeData?.title || 'Unknown Show';
          image = swipeData?.image || '';
          break;
        case 'places':
          title = swipeData?.title || 'Unknown Place';
          image = swipeData?.image || '';
          break;
        case 'restaurants':
          title = swipeData?.title || 'Unknown Restaurant';
          image = swipeData?.image || '';
          break;
        case 'recipes':
          title = swipeData?.title || 'Unknown Recipe';
          image = swipeData?.image || '';
          break;
        default:
          console.error('Unknown item type:', item_type);
      }

      // Send notifications to both users
      if (expoPushToken) {
        console.log(`Sending notification to user ${user_id} with partner name ${partner_username}`);
        sendPushNotification(expoPushToken, `You matched with ${partner_username}`);
      }
      if (partnerSwipe.expoPushToken) {
        console.log(`Sending notification to partner ${partner_id} with user name ${user_username}`);
        sendPushNotification(partnerSwipe.expoPushToken, `You matched with ${user_username}`);
      }

      // Emit match event to both users via their socket IDs with complete match data
      const userSocket = userSockets[user_id];
      const partnerSocket = userSockets[partner_id];

      if (userSocket) {
        console.log(`Sending match event to user ${user_id} with partner_name ${partner_username}`);
        io.to(userSocket.socketId).emit('match', {
          user_id,
          user_username,  // Current user's username
          partner_id,
          partner_username,  // Partner's username
          item_id,
          item_type,  // Include item type
          title,  // Include resolved title
          image,  // Include resolved image
          message: `You matched with ${partner_username}`,
        });
      }

      if (partnerSocket) {
        console.log(`Sending match event to partner ${partner_id} with user_name ${user_username}`);
        io.to(partnerSocket.socketId).emit('match', {
          user_id: partner_id,
          user_username: partner_username,  // Swap usernames for the partner
          partner_id: user_id,
          partner_username: user_username,  // Current user's username for the partner
          item_id,
          item_type,  // Include item type
          title,  // Include resolved title
          image,  // Include resolved image
          message: `You matched with ${user_username}`,
        });
      }

      // Optional: Clean up after match detection
      delete swipes[item_id];
    } else {
      console.log(`Swipe registered for User ${user_id}, waiting for partner's swipe.`);
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Optionally clean up the user from the userSockets map if needed
    for (const userId in userSockets) {
      if (userSockets[userId].socketId === socket.id) {
        delete userSockets[userId];
        console.log(`User ${userId} removed from userSockets.`);
        break;
      }
    }
  });
});

// Start the server on port 4000
server.listen(4000, () => {
  console.log('WebSocket server is running on port 4000');
});
