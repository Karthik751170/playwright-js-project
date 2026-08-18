class DataGeneratorUtil {
  /**
   * Generates a random 10-digit Indian phone number starting with 6, 7, 8, or 9.
   * @returns {string} The dynamically generated phone number.
   */
  static generateRandomPhoneNumber() {
    // Standard Indian phone numbers start with 6, 7, 8, or 9
    const startingDigits = ['6', '7', '8', '9'];
    const firstDigit = startingDigits[Math.floor(Math.random() * startingDigits.length)];
    
    // Generate the remaining 9 digits
    const remainingDigits = Math.floor(100000000 + Math.random() * 900000000).toString().substring(0, 9);
    
    return firstDigit + remainingDigits;
  }
}

module.exports = DataGeneratorUtil;
