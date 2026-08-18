const BasePage = require('../../base/BasePage');

class HerculesEditAudience extends BasePage {
  constructor(page) {
    super(page);

    // --- MODAL BUTTONS ---
    this.confirmBtn = page.getByRole('button', { name: 'Confirm' });
    this.useBtn = page.locator('button:has-text("Use")');
    this.closeDropdownArea = page.getByText('Edit AudienceVerifiedThis filter has been verified using ZK-KYC.User');

    // --- SAMPLE SIZE ---
    // The input[type="text"] inside the audience modal for updating respondent count
    this.sampleSizeInput = page.locator('input[type="text"]').first();

    // --- LOCATION FILTER ---
    this.editLocationFilterBtn = page.getByRole('button', { name: 'Edit location filter' });
    // "Remove Hyderabad", "Remove Delhi" etc — matched by prefix
    this.removeLocationBtn = page.getByRole('button', { name: /^Remove /i });
    // Location/attribute pill buttons — the white rounded pills in the dropdown
    // Using exact class match (these may be div elements, not buttons)
    this.pillOptionBtns = page.locator("[class='flex items-center gap-2 rounded-full py-2 pl-[16px] pr-[16px] text-[14px] font-[500] h-8  bg-white text-[#101010] border border-[#8E8E93]']");

    // --- DEMOGRAPHICS ---
    this.maleCheckbox  = page.locator('div').filter({ hasText: /^Male$/ });
    this.femaleCheckbox = page.locator('div').filter({ hasText: /^Female$/ });
    this.age18_24 = page.locator('div').filter({ hasText: /^18 - 24$/ });
    this.age24_35 = page.locator('div').filter({ hasText: /^24 - 35$/ });
    this.age35_45 = page.locator('div').filter({ hasText: /^35 - 45$/ });
    this.age45_55 = page.locator('div').filter({ hasText: /^45 - 55$/ });
    this.age56_90 = page.locator('div').filter({ hasText: /^56 - 90$/ });

    // --- AUDIENCE ATTRIBUTES / INTERESTS ---
    this.editAttributesFilterBtn = page.getByRole('button', { name: 'Edit attributes filter' });
    // Attribute option buttons like "Social Media - Content Creator" etc.
    // We'll fetch them dynamically in the method using getByRole('button')
  }

  // ─── HELPER ────────────────────────────────────────────────────────────────

  /** Safely click an element only if it exists and is visible. */
  async safeClick(locator, label) {
    try {
      const count = await locator.count();
      if (count > 0 && await locator.first().isVisible()) {
        await locator.first().click({ force: true });
        console.log(`[HerculesEditAudience] ✔ Clicked: ${label}`);
        return true;
      } else {
        console.log(`[HerculesEditAudience] ⚠ Not visible, skipping: ${label}`);
        return false;
      }
    } catch (e) {
      console.log(`[HerculesEditAudience] ⚠ Error clicking ${label}: ${e.message}`);
      return false;
    }
  }

  /** Close the location/attributes dropdown by clicking the "Edit Audience Verified..." header area */
  async closeDropdown() {
    console.log('[HerculesEditAudience] Closing dropdown...');
    await this.safeClick(this.closeDropdownArea, 'closeDropdownArea');
    await this.page.waitForTimeout(600);
  }

  // ─── SAMPLE SIZE ──────────────────────────────────────────────────────────

  async setSampleSizeRandom() {
    const randomSize = Math.floor(Math.random() * 4500) + 500; // 500 to 5000
    console.log(`[HerculesEditAudience] Setting sample size to: ${randomSize}`);
    try {
      const count = await this.sampleSizeInput.count();
      if (count > 0 && await this.sampleSizeInput.isVisible()) {
        await this.sampleSizeInput.click({ force: true });
        await this.sampleSizeInput.selectAll?.() ?? await this.page.keyboard.press('Control+A');
        await this.sampleSizeInput.fill(randomSize.toString());
        await this.page.waitForTimeout(400);
        console.log(`[HerculesEditAudience] ✔ Sample size set to ${randomSize}`);
      }
    } catch (e) {
      console.log(`[HerculesEditAudience] ⚠ Could not set sample size: ${e.message}`);
    }
    return randomSize;
  }

  // ─── LOCATION FILTER ─────────────────────────────────────────────────────

  async editLocationsRandomly() {
    console.log('[HerculesEditAudience] === Editing Locations ===');

    // 1. Click "Edit location filter" button
    await this.safeClick(this.editLocationFilterBtn, 'Edit location filter');
    await this.page.waitForTimeout(1000);

    // 2. Remove one existing location if any exist
    const removeCount = await this.removeLocationBtn.count();
    if (removeCount > 0) {
      console.log(`[HerculesEditAudience] Found ${removeCount} existing locations. Removing 1 randomly...`);
      const randomIdx = Math.floor(Math.random() * removeCount);
      await this.removeLocationBtn.nth(randomIdx).click({ force: true });
      await this.page.waitForTimeout(600);
    } else {
      console.log('[HerculesEditAudience] No existing locations to remove.');
    }

    // 3. Select 5-8 new location buttons using the pill CSS class
    const pillCount = await this.pillOptionBtns.count();
    const numToAdd = Math.min(pillCount, Math.floor(Math.random() * 4) + 5); // 5 to 8
    console.log(`[HerculesEditAudience] Adding ${numToAdd} locations from ${pillCount} available...`);

    if (pillCount > 0) {
      // Shuffle indices and pick random ones
      let indices = Array.from({ length: pillCount }, (_, i) => i);
      indices = indices.sort(() => 0.5 - Math.random()).slice(0, numToAdd);
      for (const idx of indices) {
        try {
          const btn = this.pillOptionBtns.nth(idx);
          const txt = await btn.textContent();
          await btn.click({ force: true });
          console.log(`[HerculesEditAudience] ✔ Selected location: ${txt?.trim()}`);
          await this.page.waitForTimeout(400);
        } catch (e) {
          console.log(`[HerculesEditAudience] ⚠ Skipped one location: ${e.message}`);
        }
      }
    } else {
      console.log('[HerculesEditAudience] ⚠ No location pills found in dropdown.');
    }

    // 4. Close the dropdown by clicking the verified header area
    await this.closeDropdown();

    // 5. Click Use if visible
    await this.safeClick(this.useBtn, 'Use button (Locations)');
    await this.page.waitForTimeout(800);
  }

  // ─── DEMOGRAPHICS ────────────────────────────────────────────────────────

  async editDemographicsRandomly() {
    console.log('[HerculesEditAudience] === Editing Demographics ===');

    // Helper: check if a div is currently selected
    // Checked state is indicated by a child div/span with a specific background or aria-checked
    const isCheckboxSelected = async (locator) => {
      try {
        const count = await locator.count();
        if (count === 0) return false;
        const el = locator.first();
        // Check aria-checked attribute
        const ariaChecked = await el.getAttribute('aria-checked');
        if (ariaChecked === 'true') return true;
        // Check if the parent/child has a filled/selected class (common React pattern)
        const classAttr = await el.getAttribute('class') ?? '';
        if (classAttr.includes('bg-[#') || classAttr.includes('selected') || classAttr.includes('active')) return true;
        // Check inner HTML for a checked SVG / tick icon
        const innerHTML = await el.innerHTML();
        if (innerHTML.includes('checkmark') || innerHTML.includes('check-circle') || innerHTML.includes('stroke-white')) return true;
        return false;
      } catch (_) {
        return false;
      }
    };

    const maleSelected = await isCheckboxSelected(this.maleCheckbox);
    const femaleSelected = await isCheckboxSelected(this.femaleCheckbox);
    console.log(`[HerculesEditAudience] Current gender state → Male: ${maleSelected}, Female: ${femaleSelected}`);

    // Decision: what gender(s) should be selected after editing?
    // 0 = Male only, 1 = Female only, 2 = Both
    const genderChoice = Math.floor(Math.random() * 3);
    console.log(`[HerculesEditAudience] Target gender choice: ${['Male only', 'Female only', 'Both'][genderChoice]}`);

    const wantMale   = genderChoice === 0 || genderChoice === 2;
    const wantFemale = genderChoice === 1 || genderChoice === 2;

    // Only click if the current state differs from what we want
    // (clicking a selected checkbox deselects it, clicking an unselected one selects it)
    if (wantMale !== maleSelected) {
      await this.safeClick(this.maleCheckbox, 'Male checkbox');
      await this.page.waitForTimeout(400);
    } else {
      console.log(`[HerculesEditAudience] Male already in desired state (${maleSelected}), skipping.`);
    }

    if (wantFemale !== femaleSelected) {
      await this.safeClick(this.femaleCheckbox, 'Female checkbox');
      await this.page.waitForTimeout(400);
    } else {
      console.log(`[HerculesEditAudience] Female already in desired state (${femaleSelected}), skipping.`);
    }

    // Age groups: pick 2-3 randomly from whichever exist on the page
    const allAgeLocators = [
      { locator: this.age18_24, label: '18-24' },
      { locator: this.age24_35, label: '24-35' },
      { locator: this.age35_45, label: '35-45' },
      { locator: this.age45_55, label: '45-55' },
      { locator: this.age56_90, label: '56-90' },
    ];

    // Filter only those that are visible on the page right now
    const visibleAges = [];
    for (const ag of allAgeLocators) {
      try {
        const c = await ag.locator.count();
        if (c > 0 && await ag.locator.first().isVisible()) {
          visibleAges.push(ag);
        }
      } catch (_) {}
    }

    const numAges = Math.min(visibleAges.length, Math.floor(Math.random() * 2) + 2); // 2-3
    const shuffledAges = visibleAges.sort(() => 0.5 - Math.random()).slice(0, numAges);
    console.log(`[HerculesEditAudience] Target random age groups to add: ${shuffledAges.length}`);
    
    for (const ag of shuffledAges) {
      const isSelected = await isCheckboxSelected(ag.locator);
      if (!isSelected) {
        await ag.locator.first().click({ force: true });
        console.log(`[HerculesEditAudience] ✔ Selected age: ${ag.label}`);
        await this.page.waitForTimeout(400);
      } else {
        console.log(`[HerculesEditAudience] Age ${ag.label} is already selected, skipping click.`);
      }
    }

    // Click Use if visible
    await this.safeClick(this.useBtn, 'Use button (Demographics)');
    await this.page.waitForTimeout(800);
  }

  // ─── AUDIENCE ATTRIBUTES / INTERESTS ─────────────────────────────────────

  async editAudienceInterestsRandomly() {
    console.log('[HerculesEditAudience] === Editing Audience Attributes ===');

    // 1. Click "Edit attributes filter"
    await this.safeClick(this.editAttributesFilterBtn, 'Edit attributes filter');
    await this.page.waitForTimeout(1000);

    // 2. Remove one existing attribute if any exist
    const removeCount = await this.removeLocationBtn.count();
    if (removeCount > 0) {
      console.log(`[HerculesEditAudience] Found ${removeCount} existing attributes. Removing 1...`);
      await this.removeLocationBtn.first().click({ force: true });
      await this.page.waitForTimeout(600);
    }

    // 3. Select 3-5 attribute pill buttons using the same pill CSS class
    const pillCount = await this.pillOptionBtns.count();
    if (pillCount > 0) {
      const numToSelect = Math.min(pillCount, Math.floor(Math.random() * 3) + 3); // 3-5
      console.log(`[HerculesEditAudience] Selecting ${numToSelect} from ${pillCount} attribute options...`);
      let indices = Array.from({ length: pillCount }, (_, i) => i);
      indices = indices.sort(() => 0.5 - Math.random()).slice(0, numToSelect);
      for (const idx of indices) {
        try {
          const btn = this.pillOptionBtns.nth(idx);
          const txt = await btn.textContent();
          await btn.click({ force: true });
          console.log(`[HerculesEditAudience] ✔ Selected attribute: ${txt?.trim()}`);
          await this.page.waitForTimeout(400);
        } catch (e) {
          console.log(`[HerculesEditAudience] ⚠ Skipped attribute: ${e.message}`);
        }
      }
    } else {
      console.log('[HerculesEditAudience] ⚠ No attribute pills found.');
    }

    // 4. Close the dropdown
    await this.closeDropdown();

    // 5. Click Use if visible
    await this.safeClick(this.useBtn, 'Use button (Attributes)');
    await this.page.waitForTimeout(800);
  }

  // ─── CONFIRM ─────────────────────────────────────────────────────────────

  async clickConfirm() {
    console.log('[HerculesEditAudience] Clicking Confirm...');
    await this.safeClick(this.confirmBtn, 'Confirm button');
    await this.page.waitForTimeout(1000);
  }
}

module.exports = HerculesEditAudience;
