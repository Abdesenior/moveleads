/**
 * Lead Scoring Service
 * Evaluates lead data and assigns a score and letter grade.
 */

/**
 * Calculates lead score and grade.
 * 
 * @param {Object} lead - The lead document or data
 * @param {number} miles - Distance in miles
 * @param {string} lineType - Twilio line type ('mobile', 'landline', etc.)
 * @param {Date|string} moveDate - The date of the move
 * @returns {Object} { score, grade, scoreFactors }
 */
function calculateLeadScore(lead, miles, lineType, moveDate) {
  let score = 50; // Base score
  const scoreFactors = [];

  // 1. Distance: +20 points if miles > 500 (Long distance)
  if (miles > 500) {
    score += 20;
    scoreFactors.push('Long Distance');
  }

  // 2. Size: +15 points for 3+ Bedrooms, 4 Bedrooms, or 5 Bedrooms
  const homeSize = lead.homeSize || '';
  if (['3 Bedroom', '4 Bedroom', '4+ Bedroom', '5 Bedroom', '5+ Bedroom'].some(s => homeSize.includes(s))) {
    score += 15;
    scoreFactors.push('High Volume Move');
  }

  // 3. Urgency: +15 points if the moveDate is within the next 30 days
  const moveD = new Date(moveDate);
  const now = new Date();
  const diffTime = moveD.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 0 && diffDays <= 30) {
    score += 15;
    scoreFactors.push('High Urgency');
  }

  // 4. Quality: +10 points if Twilio lineType is 'mobile'
  if (lineType === 'mobile') {
    score += 10;
    scoreFactors.push('Mobile Verified');
  }

  // Grading Logic:
  // Score >= 85: Grade 'A'
  // Score 70 - 84: Grade 'B'
  // Score 50 - 69: Grade 'C'
  // Score < 50: Grade 'D'
  let grade = 'D';
  if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';

  return { score, grade, scoreFactors };
}

module.exports = { calculateLeadScore };
