const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
}

function formatUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyName: user.companyName,
    phone: user.phone,
    isActive: user.isActive,
  };
}

router.post("/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      companyName,
      phone,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: role || "CLIENT",
      companyName: companyName || "",
      phone: phone || "",
    });

    const token = createToken(user);

    return res.status(201).json({
      message: "User registered successfully",
      access_token: token,
      user: formatUser(user),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error during register",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "This account is disabled",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = createToken(user);

    return res.json({
      message: "Login successful",
      access_token: token,
      user: formatUser(user),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error during login",
    });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  return res.json({
    user: formatUser(req.user),
  });
});

module.exports = router;