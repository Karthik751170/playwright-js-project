const fs = require('fs');
const html = fs.readFileSync('post_signup_dom.html', 'utf8');

const textToFind = ['Check your email', 'Password', 'OTP', 'Verification', 'Welcome'];

textToFind.forEach(text => {
  if (html.toLowerCase().includes(text.toLowerCase())) {
    console.log(`Found: ${text}`);
  }
});
