const fs = require('fs');
const html = fs.readFileSync('post_signup_dom.html', 'utf8');

const buttonRegex = /<button[^>]*>.*?<\/button>/gs;
let match;
while ((match = buttonRegex.exec(html)) !== null) {
  const btn = match[0].replace(/\n/g, '').replace(/\s+/g, ' ').substring(0, 150);
  console.log(btn);
}
