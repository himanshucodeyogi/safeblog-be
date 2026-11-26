const mongoose = require('mongoose');

const DecoyBlogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Blog title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Blog content is required'],
      maxlength: [30000, 'Content cannot exceed 30,000 characters'], // Matches UI: 0 / 30,000
    },
    mood: {
      type: String,
      enum: {
        values: ['Happy', 'Reflective', 'Anxious', 'Sad', 'Calm', 'Grateful'],
        message: '{VALUE} is not a valid mood tag',
      },
      default: 'Reflective',
      index: true,
    },
    // Matches UI toggle: "Share Publicly" vs "Just Me / Only visible to you"
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Matches UI: "Save Draft" vs "Save Entry"
    isDraft: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Optional reference to a Daily Prompt if created from one
    dailyPrompt: {
      promptText: { type: String, default: null },
      isPromptResponse: { type: Boolean, default: false },
    },
    readTimeMinutes: {
      type: Number,
      default: 1,
      min: 1,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    bookmarks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-calculate read time before saving (approx. 200 words per minute)
DecoyBlogSchema.pre('save', function (next) {
  if (this.isModified('content') && this.content) {
    const wordCount = this.content.trim().split(/\s+/).length;
    this.readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
  }
  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  next();
});

// Composite index for fast calendar/date queries and public explore feed
DecoyBlogSchema.index({ userId: 1, createdAt: -1 });
DecoyBlogSchema.index({ isPublic: 1, isDraft: 1, createdAt: -1 });
DecoyBlogSchema.index({ isPublic: 1, mood: 1, createdAt: -1 });

module.exports =
  mongoose.models.DecoyBlog || mongoose.model('DecoyBlog', DecoyBlogSchema);
