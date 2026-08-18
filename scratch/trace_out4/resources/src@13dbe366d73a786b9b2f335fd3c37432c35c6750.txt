class BasePage {
  constructor(page) {
    this.page = page;
  }

  async waitForVisible(locator, timeout = 10000) {
    await locator.first().waitFor({ state: 'visible', timeout });
  }

  async clickIfVisible(locator, timeout = 10000) {
    const target = locator.first();
    try {
      await target.waitFor({ state: 'visible', timeout });
      await target.click();
      return true;
    } catch {
      return false;
    }
  }

  async fillIfVisible(locator, value, timeout = 10000) {
    const target = locator.first();
    try {
      await target.waitFor({ state: 'visible', timeout });
      await target.fill(value);
      return true;
    } catch {
      return false;
    }
  }

  async isVisible(locator, timeout = 2000) {
    try {
      await locator.first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async getVisibleText() {
    return this.page.locator('body').innerText();
  }

  async getVisibleElements(locator) {
    const handles = await locator.elementHandles().catch(() => []);
    const visible = [];

    for (const handle of handles) {
      const isVisible = await handle.evaluate((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return !!(rect.width || rect.height) && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });

      if (isVisible) {
        visible.push(handle);
      }
    }

    return visible;
  }
}

module.exports = BasePage;
