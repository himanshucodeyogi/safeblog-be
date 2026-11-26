require('dotenv').config();
const connectToDatabase = require('./db');
const { User, DecoyBlog, PrivateChat, Message } = require('../models');

async function seed() {
  console.log('[Seed] Connecting to MongoDB...');
  await connectToDatabase();

  console.log('[Seed] Checking for default user @krishna_codeyogi...');
  let krishna = await User.findOne({ username: 'krishna_codeyogi' });

  const blogPinHash = await User.hashPin('1234');
  const safePinHash = await User.hashPin('9999');

  if (!krishna) {
    krishna = await User.create({
      username: 'krishna_codeyogi',
      displayName: 'Krishna Codeyogi',
      email: 'krishna@safeblog.app',
      bio: 'Building apps & documenting daily thoughts.',
      blogPinHash,
      safePinHash,
      streakCount: 1,
    });
    console.log('[Seed] Created @krishna_codeyogi with PINs: Blog=1234, Safe=9999');
  } else {
    krishna.blogPinHash = blogPinHash;
    krishna.safePinHash = safePinHash;
    await krishna.save();
    console.log('[Seed] Updated @krishna_codeyogi with PINs: Blog=1234, Safe=9999');
  }

  // Create or update contact Rakesh Sehgal Sir
  let rakesh = await User.findOne({ username: 'rakesh_sehgal' });
  if (!rakesh) {
    rakesh = await User.create({
      username: 'rakesh_sehgal',
      displayName: 'Rakesh Sehgal Sir',
      email: 'rakesh@safeblog.app',
      blogPinHash: await User.hashPin('0000'),
      safePinHash: await User.hashPin('1111'),
    });
    console.log('[Seed] Created contact @rakesh_sehgal');
  }

  // Create conversation between Krishna and Rakesh if not existing
  let chat = await PrivateChat.findOne({
    participants: { $all: [krishna._id, rakesh._id] },
  });

  if (!chat) {
    chat = await PrivateChat.create({
      participants: [krishna._id, rakesh._id],
      lastMessagePreview: '7827405083',
      lastMessageAt: new Date(),
      lastMessageSender: rakesh._id,
    });

    // Add initial messages matching screenshot
    await Message.create([
      {
        chatId: chat._id,
        senderId: rakesh._id,
        text: 'beta koshish jari hai. har district se alag alag support rehta hai.',
        timestamp: new Date('2025-08-11T17:09:00'),
        reactions: [{ user: krishna._id, emoji: '❤️' }],
      },
      {
        chatId: chat._id,
        senderId: krishna._id,
        text: 'Sir g, aaj ki meeting ka uddeshya kya tha?',
        timestamp: new Date('2025-09-05T18:50:00'),
        isRead: true,
      },
      {
        chatId: chat._id,
        senderId: rakesh._id,
        text: 'Beta ye sir hamari kuch madad kar rahe hain chijon ko sudharne me',
        timestamp: new Date('2025-09-07T10:11:00'),
      },
      {
        chatId: chat._id,
        senderId: rakesh._id,
        text: 'Isliye students se baat karna chahte they',
        timestamp: new Date('2025-09-07T10:11:30'),
        reactions: [{ user: krishna._id, emoji: '❤️' }],
      },
      {
        chatId: chat._id,
        senderId: krishna._id,
        text: 'Good evening sir g, apna number share kar dijiye. Mere papa ji aapse baat karna chahte hain.',
        timestamp: new Date('2025-09-09T18:02:00'),
        isRead: true,
      },
      {
        chatId: chat._id,
        senderId: rakesh._id,
        text: 'good evening beta',
        timestamp: new Date('2025-09-10T12:20:00'),
      },
      {
        chatId: chat._id,
        senderId: rakesh._id,
        text: '7827405083',
        timestamp: new Date('2025-09-10T12:21:00'),
      },
    ]);
    console.log('[Seed] Created sample conversation and messages');
  }

  // Create sample decoy blogs
  const blogCount = await DecoyBlog.countDocuments({ userId: krishna._id });
  if (blogCount === 0) {
    await DecoyBlog.create([
      {
        userId: krishna._id,
        title: 'Shipped v1 after 3 weeks of late nights',
        content:
          'Deleted half the features I originally planned and focused only on making the core loop feel snappy. Best decision I made this month.',
        mood: 'Happy',
        isPublic: true,
        isDraft: false,
        likesCount: 23,
        commentsCount: 5,
        readTimeMinutes: 1,
      },
      {
        userId: krishna._id,
        title: 'Death of the mind, or just quiet?',
        content:
          'Sometimes stepping away from notifications for 48 hours feels scary at first, and then suddenly your thoughts have room to breathe again.',
        mood: 'Reflective',
        isPublic: true,
        isDraft: false,
        likesCount: 14,
        commentsCount: 4,
        readTimeMinutes: 2,
      },
    ]);
    console.log('[Seed] Created sample decoy blogs');
  }

  console.log('[Seed] Seeding completed successfully!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
