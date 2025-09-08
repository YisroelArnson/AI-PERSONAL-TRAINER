// A service to get exercise recommendations based on the user's goals and preferences

const {fetchAllUserData} = require('./fetchUserData.service');
const { generateExercises } = require('../ai/tools/generateExercises');

const getRecommendations = async (userId, exerciseCount = 8) => {
    const userData = await fetchAllUserData(userId);
    try {
        const result = await generateExercises(userData, {
            model: "deepseek/deepseek-chat-v3.1:free",
            exerciseCount: exerciseCount
        });
        console.log(JSON.stringify(result, null, 2));
        return result; // { exercises: [...] }
    } catch (e) {
        return {
            error: 'Failed to generate exercises',
            details: e.message
        };
    }
}

module.exports = { getRecommendations };
