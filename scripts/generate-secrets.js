#!/usr/bin/env node
// Prints strong random values for the secret environment variables. Copy them into .env.

const crypto = require("node:crypto");

const secret = () => crypto.randomBytes(48).toString("base64url");

console.log(`# Paste into my-portfolio-backend/.env
JWT_ACCESS_SECRET=${secret()}
JWT_REFRESH_SECRET=${secret()}
REVALIDATE_SECRET=${secret()}

# Put the same REVALIDATE_SECRET value into my-portfolio-frontend/.env.local`);
