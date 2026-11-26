const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      maxlength: [200, 'Bio cannot exceed 200 characters'],
      default: '',
    },
    // Decoy Blog Lock Screen PIN (e.g. "1234")
    blogPinHash: {
      type: String,
      required: [true, 'Blog decoy PIN is required'],
      select: false, // Don't return by default in queries
    },
    // Secret Private Chat Lock Screen PIN (e.g. "9999")
    safePinHash: {
      type: String,
      required: [true, 'Safe secret PIN is required'],
      select: false, // Don't return by default in queries
    },
    // Decoy Social & Habit Tracking
    streakCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActiveDate: {
      type: Date,
      default: null,
    },
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for followers count
UserSchema.virtual('followersCount').get(function () {
  return this.followers ? this.followers.length : 0;
});

// Virtual for following count
UserSchema.virtual('followingCount').get(function () {
  return this.following ? this.following.length : 0;
});

// Method to verify Blog PIN
UserSchema.methods.compareBlogPin = async function (enteredPin) {
  return bcrypt.compare(enteredPin, this.blogPinHash);
};

// Method to verify Safe PIN
UserSchema.methods.compareSafePin = async function (enteredPin) {
  return bcrypt.compare(enteredPin, this.safePinHash);
};

// Static helper to hash PIN
UserSchema.statics.hashPin = async function (plainPin) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPin, salt);
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
