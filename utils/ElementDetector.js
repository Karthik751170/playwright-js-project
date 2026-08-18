class ElementDetector {
  async detect(elements) {
    let text = '';

    try {
      if (elements.questionText) {
        text = await elements.questionText.textContent();

        // Ensure text is always a string
        if (typeof text !== 'string') {
          text = String(text || '');
        }
      }
    } catch (e) {
      text = '';
    }

    console.log('Question Text:', text);
    console.log('Type:', typeof text);

    const type = await this._inferQuestionType(elements, text);
    elements.questionType = type;

    return type;
  }

  async _inferQuestionType(elements, text) {
    const normalized =
      typeof text === 'string'
        ? text.toLowerCase()
        : String(text || '').toLowerCase();

    if (await this._isVisibleElement(elements.dropdown))
      return 'dropdown';

    if (await this._isVisibleElement(elements.slider))
      return 'slider';

    if (await this._isVisibleElement(elements.uploadButton))
      return 'file_upload';

    return 'unknown';
  }

  async _isVisibleElement(locator) {
    if (!locator) return false;

    return (await locator.count()) > 0;
  }
}

module.exports = ElementDetector;