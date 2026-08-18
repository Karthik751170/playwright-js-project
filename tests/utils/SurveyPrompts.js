const topics = [
  "daily coffee habits", "remote work preferences", "online shopping experiences", 
  "fitness and workout tracking apps", "streaming service viewing habits", 
  "dietary habits and meal prep", "employee engagement and workplace culture", 
  "virtual event feedback", "travel preferences and vacation planning", 
  "smart home devices", "personal finance and budgeting tools", 
  "electric vehicle adoption", "mental health and meditation apps", 
  "e-learning and online courses", "pet care and pet food preferences", 
  "sustainable fashion and ethical shopping", "freelance work challenges", 
  "cybersecurity and data privacy awareness", "cryptocurrency and investing habits", 
  "plant-based diets and vegan products", "public transportation usage",
  "home renovation and DIY projects", "mobile gaming habits",
  "podcast listening preferences", "skincare and beauty routines",
  "subscription box services", "food delivery and meal kit services",
  "social media usage and screen time", "local community engagement",
  "home office setups and ergonomics", "outdoor recreation and hiking",
  "language learning apps", "car ownership and maintenance",
  "music streaming and concert attendance", "photography and camera gear",
  "baking and cooking at home", "vintage and thrift shopping",
  "smartwatch and wearable technology", "productivity and time management tools",
  "digital nomad lifestyle"
];

const goals = [
  "understand preferences and challenges",
  "measure customer satisfaction",
  "collect user feedback",
  "evaluate user experience",
  "gauge interest in new features",
  "identify pain points",
  "assess overall engagement",
  "determine pricing sensitivity",
  "explore purchasing motivations",
  "track brand awareness and loyalty"
];

const audiences = [
  "millennials", "small business owners", "college students", 
  "frequent travelers", "remote workers", "new parents", 
  "healthcare professionals", "avid gamers", "fitness enthusiasts",
  "freelancers", "retirees", "tech early adopters", "pet owners",
  "homeowners", "teachers and educators"
];

const formats = [
  "Create a short survey about {topic} to {goal} among {audience}.",
  "Design a questionnaire about {topic} targeting {audience} to {goal}.",
  "Generate a feedback survey for {audience} focusing on {topic} to {goal}.",
  "Create a market research survey about {topic} to {goal}.",
  "Design a brief survey on {topic} to {goal} for {audience}."
];

let prompts = [];
let index = 0;

for (let topic of topics) {
  for (let format of formats) {
    if (prompts.length >= 200) break;
    
    // Pick deterministic goal and audience based on index to ensure variety
    const goal = goals[(index * 3) % goals.length];
    const audience = audiences[(index * 7) % audiences.length];
    
    let prompt = format
      .replace('{topic}', topic)
      .replace('{goal}', goal)
      .replace('{audience}', audience);
      
    prompts.push(prompt);
    index++;
  }
}

module.exports = prompts;
