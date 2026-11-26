const mongoose = require('mongoose');

const PrivateChatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Cached preview for instant rendering in Telegram-style chat list
    lastMessagePreview: {
      type: String,
      default: '',
      maxlength: 250,
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Unread count tracking per participant: { "userId": 2 }
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    // Users who have archived this conversation (Matches "Archived Chats" folder in UI)
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Users who have muted notifications for this conversation (Matches mute icon in UI)
    mutedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Chat classification / folder category (Matches Telegram top folder tabs)
    folder: {
      type: String,
      default: 'all',
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for fast retrieval by user and sort by recency
PrivateChatSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports =
  mongoose.models.PrivateChat ||
  mongoose.model('PrivateChat', PrivateChatSchema);
