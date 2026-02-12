# AI Personal Trainer App - Current State Overview

*Last updated: January 23, 2026*

## What Is This App?

This is an **AI-powered personal fitness assistant** that creates personalized workout recommendations through natural conversation. Think of it as having a personal trainer in your pocket who knows your goals, equipment, injuries, and workout history - and can create custom workouts on the fly.

---

## The Big Picture

The app has two main parts working together:

1. **iOS App (Frontend)** - A beautifully designed SwiftUI app where users interact with the AI, see their workouts, and track progress
2. **Node.js Backend** - The "brain" that runs the AI agent, stores user data, and manages all the intelligence

---

## What Can Users Do Right Now?

### Get Personalized Workouts
Users can chat with the AI assistant and ask for workouts. The AI considers:
- What equipment is available at their current location
- Their fitness goals (strength, cardio, flexibility, etc.)
- Which muscle groups they want to focus on
- Their workout history (to avoid overworking certain muscles)
- Any injuries or preferences they've set

### Chat with an AI Assistant
There's a floating chat button always visible in the app. When tapped:
- Opens a chat overlay (like iMessage or ChatGPT)
- Shows real-time progress as the AI "thinks" (e.g., "Fetching your preferences...", "Creating workout...")
- The AI can ask clarifying questions with multiple choice options
- Delivers workout "artifacts" - interactive cards showing the full workout plan

### Multiple Workout Locations
Users can save different locations (home gym, commercial gym, park, etc.) with:
- Custom equipment lists per location
- GPS-based auto-detection (app switches location automatically)
- Quick switching from anywhere in the app

### Set Fitness Goals
Two types of goals:
- **Category Goals**: What type of fitness to focus on (strength, cardio, flexibility, balance, etc.)
- **Muscle Goals**: Which muscle groups to prioritize or de-prioritize

The AI balances workouts to match these preferences over time.

### Track Workout History
- See completed exercises with filters (today, this week, this month, all time)
- The system tracks "distribution" - how much each muscle and goal category has been worked
- This feeds back into recommendations to keep workouts balanced

### Customize Experience
- Weight units (kg or lbs)
- Distance units (km or miles)
- Auto-refresh settings (how often to fetch new workouts)
- Auto-location detection toggle

---

## How the Workout Experience Works

1. **Home Screen** shows a stack of exercise cards
2. Each exercise displays differently based on type:
   - **Reps exercises** (push-ups, squats): Shows sets and reps, tap to complete sets
   - **Hold exercises** (planks, wall sits): Shows hold duration per set
   - **Duration exercises** (running, cycling): Shows time/distance with pace targets
   - **Interval exercises** (HIIT, tabata): Shows work/rest intervals and rounds
3. Users swipe through exercises and tap a glowing orb button to mark complete
4. Can adjust reps, weights, and sets on the fly
5. When done, can refresh for new recommendations or chat with AI for something specific

---

## The AI Agent System (The Smart Part)

The backend runs a sophisticated AI agent using **Claude** (Anthropic's AI). Here's how it works:

### The Agent Loop
When a user sends a message:
1. A fast "initializer" AI quickly decides what data is needed
2. The main AI receives the message plus relevant context (goals, history, equipment, etc.)
3. The AI uses "tools" to take actions:
   - **Fetch data** - Get more information about the user
   - **Generate workout** - Create an exercise plan
   - **Ask questions** - Get clarification from the user
   - **Set preferences** - Update user settings
   - **Send messages** - Respond to the user
4. This loops until the AI calls "idle" (done with the task)
5. Everything streams back to the app in real-time

### What Makes It Smart
- **Context awareness**: Knows the user's full history, goals, and constraints
- **Distribution tracking**: Balances which muscles and goals get worked over time
- **Equipment filtering**: Only suggests exercises possible with available equipment
- **Progressive responses**: Shows its thinking process, not just final answers
- **Multi-turn memory**: Remembers the conversation within a session

---

## Current App Navigation

The app uses a **side drawer** navigation (swipe from left edge):
- **Home** - Main workout experience
- **Stats** - Workout history and analytics
- **Preferences** - Goals, equipment, locations
- **Profile** - App settings

Plus the **floating AI button** is always visible for quick chat access.

---

## Technical Foundation That's Already Built

### Frontend (iOS)
- Full SwiftUI app with modern @Observable state management
- Supabase authentication (sign up, login, session management)
- Real-time SSE (Server-Sent Events) streaming from backend
- Persistent storage for workout state and settings
- Location services for GPS-based auto-detection
- Beautiful "Aurora" design theme with warm gradients and smooth animations

### Backend
- Express.js API with comprehensive endpoints
- Anthropic Claude integration with native tool use
- Prompt caching (reduces AI costs by ~90%)
- Full observability system (tracks every AI interaction, token usage, costs)
- PostgreSQL database via Supabase with row-level security
- JWT authentication middleware

---

## What's Working End-to-End

- User authentication and account management
- Creating and managing multiple workout locations with equipment
- Setting category and muscle goals
- AI-generated personalized workouts
- Real-time chat with streaming responses
- Four exercise types with specialized UIs
- Completing exercises and tracking sets/reps/weights
- Workout history storage and retrieval
- Exercise distribution tracking for balanced recommendations
- Setting preferences (equipment, injuries, time constraints)
- Unit preferences (kg/lbs, km/mi)
- Auto-location detection

---

## Summary for Another Agent

**This app is a functional AI personal trainer.** A user can sign up, set their goals, add their gym locations with equipment, and then chat with an AI to get personalized workouts. The AI sees their full context and creates workouts that balance their goals over time. Users complete workouts on a card-based interface, and their history feeds back into future recommendations.

The core functionality is complete - what remains would be polish, additional features, and edge case handling. The architecture is solid with proper separation between the iOS frontend and Node.js backend, real-time communication via SSE, and a sophisticated multi-turn AI agent system with observability built in.
