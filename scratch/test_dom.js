const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

const html = fs.readFileSync('scratch/active_question_dom.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

console.log("img[alt='Dropdown'] count:", document.querySelectorAll("img[alt='Dropdown']").length);
console.log("button[data-testid^='ranking-option-'] count:", document.querySelectorAll("button[data-testid^='ranking-option-']").length);
