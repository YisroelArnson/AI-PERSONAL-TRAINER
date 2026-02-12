# Onboarding Haptics (#1) & Resume Gate (#13) Implementation Plan

## Overview
Add haptic feedback to all onboarding interaction points and a "resume where I left off" / "start over" experience when users return mid-onboarding.

## Phase 1: HapticManager Utility
Create `Core/HapticManager.swift` with static methods for each haptic type.

## Phase 2: Add Haptics to Shared Components
Add haptics to `ChevronButton` (covers ~15 screens) and `VoiceBottomBar` mic toggle.

## Phase 3: Add Haptics to Individual Screens
All remaining interaction points across all onboarding screens.

## Phase 4: Resume Gate
New `OnboardingResumeView` + detection logic in `OnboardingStore` + integration in `OnboardingCoordinatorView`.
