'use strict';

const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.resolve(__dirname, '../prompts');

function readTemplate(filename) {
    const fullPath = path.join(PROMPTS_DIR, filename);
    try {
        return fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
        throw new Error(`Missing prompt template: ${filename} at ${fullPath}`);
    }
}

function stringifySection(label, payload) {
    const serialized = JSON.stringify(payload, null, 2);
    return `\n[DATA: ${label}]\n${serialized}\n`;
}

/**
 * Build a dynamic prompt from user data returned by fetchAllUserData
 * @param {Object} userData - The object returned by fetchAllUserData(userId)
 * @param {number} [exerciseCount=8] - Number of exercises to generate
 * @returns {string} assembled prompt
 */
function buildUserDataPrompt(userData, exerciseCount = 8) {
    if (!userData || typeof userData !== 'object') {
        throw new Error('buildUserDataPrompt requires a userData object');
    }
    
    if (typeof exerciseCount !== 'number' || exerciseCount < 1 || exerciseCount > 20) {
        throw new Error('exerciseCount must be a number between 1 and 20');
    }

    let base = readTemplate('base.txt');
    base = base.replace('{{EXERCISE_COUNT}}', exerciseCount.toString());

    const sections = [];

    // Body stats
    if (userData.data && userData.data.bodyStats) {
        sections.push(readTemplate('section.bodyStats.txt'));
        sections.push(stringifySection('BODY STATS', userData.data.bodyStats));
    }

    // User categories & weights
    if (userData.data && Array.isArray(userData.data.userCategoryAndWeights) && userData.data.userCategoryAndWeights.length > 0) {
        sections.push(readTemplate('section.userCategoryAndWeights.txt'));
        sections.push(stringifySection('USER CATEGORIES & WEIGHTS', userData.data.userCategoryAndWeights));
    }

    // Muscle targets & weights
    if (userData.data && Array.isArray(userData.data.userMuscleAndWeight) && userData.data.userMuscleAndWeight.length > 0) {
        sections.push(readTemplate('section.userMuscleAndWeight.txt'));
        sections.push(stringifySection('MUSCLE TARGETS & WEIGHTS', userData.data.userMuscleAndWeight));
    }

    // Locations
    if (userData.data && Array.isArray(userData.data.locations) && userData.data.locations.length > 0) {
        sections.push(readTemplate('section.locations.txt'));
        sections.push(stringifySection('LOCATIONS', userData.data.locations));
    }

    // Preferences
    if (userData.data && Array.isArray(userData.data.preferences) && userData.data.preferences.length > 0) {
        sections.push(readTemplate('section.preferences.txt'));
        sections.push(stringifySection('PREFERENCES', userData.data.preferences));
    }

    const assembledSections = sections.join('\n');
    const prompt = base.replace('{{SECTIONS}}', assembledSections || '\n[No user data sections provided]\n');
    return prompt;
}

module.exports = { buildUserDataPrompt };
