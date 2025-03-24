const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, "Name is required"],
    },

    slug: {
      type: String,
      lowercase: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
    },

    phone: String,

    profileImg: String,

    password: {
      type: String,
      required: [true, "password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
    },
    passwordChangedAt: Date,

    passwordResetCode: String,

    passwordResetExpires: Date,

    passwordResetVerified: Boolean,

    role: {
      type: String,
      enum: ["user", "support", "admin"],
      default: "user",
    },

    active: {
      type: Boolean,
      default: true,
    },
  },

  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  // Hashing user password
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
