const fs = require('fs');
const html = fs.readFileSync('post_signup_dom.html', 'utf8');

const inputRegex = /<input[^>]*>/g;
let match;
while ((match = inputRegex.exec(html)) !== null) {
  console.log(match[0]);
}
