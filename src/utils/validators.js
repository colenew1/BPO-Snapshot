/**
 * Validates that a result has all required fields for story generation
 * @param {Object} result - Query result from database
 * @returns {boolean}
 */
export function validateHighPerformerResult(result) {
  const required = ['client', 'organization', 'program', 'amplifai_metric'];
  return required.every(field => result[field] != null && result[field] !== '');
}

/**
 * Validates that metrics are within reasonable bounds
 * @param {Object} result - Query result
 * @returns {boolean}
 */
export function validateMetricBounds(result) {
  if (result.avg_actual == null || result.avg_goal == null) {
    return false;
  }
  
  // Check that actual is within 30% to 300% of goal (as per SQL query)
  const ratio = result.avg_actual / result.avg_goal;
  return ratio >= 0.3 && ratio <= 3;
}

/**
 * Validates coaching data structure
 * @param {Array} coachingData - Array of coaching records
 * @returns {boolean}
 */
export function validateCoachingData(coachingData) {
  if (!Array.isArray(coachingData)) {
    return false;
  }
  
  return coachingData.every(item => 
    item.behavior != null && 
    item.total_sessions != null &&
    item.avg_effectiveness != null
  );
}

