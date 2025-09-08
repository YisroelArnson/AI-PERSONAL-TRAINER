// A controller to get exercise recommendations based on the user's goals and preferences

//a function that calls the recommend service file and returns the recommendations

const recommendService = require('../services/recommend.service');

const getRecommendations = async (req, res) => {
    const recommendations = await recommendService.getRecommendations(req.user.id);
    res.json(recommendations);
};

module.exports = { getRecommendations };