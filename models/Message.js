const mongoose = require('mongoose');

const MessageReactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    emoji: {
      type: String,
      required: true,
      maxlength: 10,
    },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PrivateChat',
      required: [true, 'Chat ID is required'],
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
      index: true,
    },
    // The message text (can store plaintext or AES-256 client-side encrypted ciphertext)
    text: {
      type: String,
      required: [true, 'Message text is required'],
    },
    // Read status for Telegram-style single check (sent) vs double checks (read)
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Quoted reply support (Matches the reply box preview in the UI screenshots)
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    // Emoji reactions (Matches the heart reaction emoji on chat bubbles in UI screenshots)
    reactions: [MessageReactionSchema],
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for fetching chat history and polling unread messages
MessageSchema.index({ chatId: 1, timestamp: -1 });
MessageSchema.index({ chatId: 1, isRead: 1 });
MessageSchema.index({ senderId: 1, timestamp: -1 });

module.exports =
  mongoose.models.Message || mongoose.model('Message', MessageSchema);
