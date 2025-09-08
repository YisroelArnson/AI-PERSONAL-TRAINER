# AI Personal Trainer Backend API

A simple Express.js API server for the AI Personal Trainer application.

## Features

- 🚀 Express.js server with modern middleware
- 🔒 Security headers with Helmet
- 🌐 CORS enabled for cross-origin requests
- 📝 Request logging
- 🏥 Health check endpoint
- 🎯 Basic API structure for users and workouts
- ⚡ Error handling and 404 responses

## Quick Start

### Install Dependencies
```bash
npm install
```

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port 3000 (or the PORT environment variable if set).

## API Endpoints

### Health Check
- **GET** `/health` - Server health status

### Root
- **GET** `/` - API information and available endpoints

### Users
- **GET** `/api/users` - Get users (placeholder)

### Workouts
- **GET** `/api/workouts` - Get workouts (placeholder)

## Environment Variables

- `PORT` - Server port (default: 3000)

## Project Structure

```
BACKEND/
├── index.js          # Main server file
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

## Next Steps

1. Add database connection (Supabase is already configured)
2. Implement user authentication
3. Add workout management endpoints
4. Set up proper data models
5. Add validation middleware
6. Implement rate limiting

## Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (to be implemented)
