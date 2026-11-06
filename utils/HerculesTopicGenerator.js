/**
 * Generates a fresh, random Hercules survey topic for every run, so tests never depend on one
 * fixed subject (survey content, brief and audience are all dynamic anyway).
 *
 * Brands are fictional on purpose: negative prompts later ask Hercules to make false claims about
 * the brand, and those must never be about a real company.
 *
 *   const { generateTopic } = require('./utils/HerculesTopicGenerator');
 *   const t = generateTopic();            // random
 *   const t = generateTopic({ seed: 42 }); // reproducible
 *   t.prompt  -> text to type into "Describe the research you want to run"
 */

const CATEGORIES = [
    { category: 'used two-wheeler resale', product: 'an app that buys used motorcycles and scooters with doorstep inspection', buyer: 'two-wheeler owners planning to sell' },
    { category: 'electric scooters', product: 'a subscription plan for electric scooters with battery swapping', buyer: 'daily commuters' },
    { category: 'packaged snacks', product: 'a millet-based healthy snack range', buyer: 'health-conscious urban snackers' },
    { category: 'edtech', product: 'a live coding course app for college students', buyer: 'engineering students' },
    { category: 'quick commerce', product: '10-minute grocery delivery with a monthly membership', buyer: 'working professionals' },
    { category: 'personal finance', product: 'a gold savings app with daily micro-investments', buyer: 'first-time savers' },
    { category: 'pet care', product: 'a fresh-cooked dog food delivery service', buyer: 'dog owners' },
    { category: 'fitness', product: 'a home workout app with live trainers in regional languages', buyer: 'adults wanting to get fit at home' },
    { category: 'skincare', product: 'a sunscreen made for humid climates', buyer: 'young adults who use skincare daily' },
    { category: 'home services', product: 'an on-demand appliance repair app with fixed prices', buyer: 'homeowners and renters' },
    { category: 'coffee', product: 'a cold-brew coffee in ready-to-drink cans', buyer: 'young coffee drinkers' },
    { category: 'travel', product: 'a weekend getaway booking app for nearby destinations', buyer: 'young couples and friend groups' },
    { category: 'insurance', product: 'a pay-per-km car insurance plan', buyer: 'car owners who drive less than 5,000 km a year' },
    { category: 'mobility', product: 'an office shuttle bus subscription', buyer: 'employees at tech parks' },
];
const BRAND_A = ['Nova', 'Zesto', 'Kirana', 'Velo', 'Arka', 'Bluepeak', 'Tanvi', 'Orbit', 'Sutra', 'Lumo', 'Pragati', 'Kesar'];
const BRAND_B = ['Labs', 'Go', 'One', 'Hub', 'Works', 'Bharat', 'Plus', 'Direct', 'Club', 'Express'];
const GEOS = [
    'all tier 1 and tier 2 cities in India', 'metro cities (Delhi, Mumbai, Bengaluru, Chennai, Hyderabad, Kolkata)',
    'tier 2 and tier 3 cities in South India', 'Pune, Ahmedabad, Jaipur and Lucknow', 'pan-India urban',
];
const GOALS = [
    'test whether the concept is appealing and believable before launch',
    'find the right price point and willingness to pay',
    'understand current habits, pain points and switching triggers',
    'decide which features to launch first',
    'measure purchase intent and the main barriers to trial',
];

function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function generateTopic({ seed = Date.now() } = {}) {
    const r = rng(seed);
    const pick = arr => arr[Math.floor(r() * arr.length)];
    const c = pick(CATEGORIES);
    const brand = `${pick(BRAND_A)}${pick(BRAND_B)}`;
    const geo = pick(GEOS);
    const goal = pick(GOALS);
    const prompt = `Create a survey for ${brand}, which is launching ${c.product}. ` +
        `Target ${c.buyer} across ${geo}. The goal is to ${goal}.`;
    return { seed, brand, category: c.category, product: c.product, audience: c.buyer, geography: geo, goal, prompt };
}

module.exports = { generateTopic };

if (require.main === module) {
    const seed = process.argv[2] ? Number(process.argv[2]) : undefined;
    console.log(JSON.stringify(generateTopic(seed ? { seed } : undefined), null, 2));
}
