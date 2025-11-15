// --- DEPENDENCIES ---
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { OpenAI } = require('openai');

// --- INITIALIZE EXPRESS APP ---
const app = express();
app.use(bodyParser.json());

// --- CONFIGURATION & SECRETS ---
// This is the one value you need to set manually in this file.
// It can be any random string.
const VERIFY_TOKEN = "YOUR_VERIFY_TOKEN"; 

// These secrets are loaded from your hosting environment (e.g., Render's Environment Variables)
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- INITIALIZE OPENAI CLIENT ---
// The app will crash on startup if OPENAI_API_KEY is not set in the environment.
if (!OPENAI_API_KEY) {
  console.error("CRITICAL ERROR: The OPENAI_API_KEY environment variable is missing.");
  process.exit(1); // Exit the process with an error code
}
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });


// --- WEBHOOK ENDPOINTS ---

// This endpoint is for Facebook to verify your server.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    console.error('Webhook verification failed.');
    res.sendStatus(403);
  }
});

// This endpoint receives all the events from Facebook.
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('Received webhook:', JSON.stringify(body, null, 2));

  // Check if the webhook is for a group and contains a mention
  if (body.object === 'group' && body.entry) {
    for (const entry of body.entry) {
      if (entry.changes) {
        for (const change of entry.changes) {
          // We are interested in mentions in comments or posts
          if (change.field === 'comments' || change.field === 'posts') {
            const messageObject = change.value;
            // The actual text message from the user
            const userMessage = messageObject.message;
            // The ID of the post or comment where the mention happened
            const objectId = messageObject.post_id || messageObject.comment_id;

            if (userMessage && objectId) {
              console.log(`Received message: "${userMessage}" on object ${objectId}`);
              
              // Get a smart reply from the AI
              const aiResponse = await getAiResponse(userMessage);

              // Post the AI's reply back to the group
              await sendGroupReply(objectId, aiResponse);
            }
          }
        }
      }
    }
  }

  // Always respond with 200 OK to Facebook, otherwise it will keep retrying.
  res.status(200).send('EVENT_RECEIVED');
});

// --- HELPER FUNCTIONS ---

// Function to get a response from the OpenAI API
async function getAiResponse(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful and friendly assistant in a Facebook group." },
        { role: "user", content: prompt }
      ],
    });

    const aiMessage = completion.choices[0].message.content;
    console.log("AI Response:", aiMessage);
    return aiMessage;
  } catch (error) {
    console.error("Error getting AI response:", error);
    return "Sorry, my AI brain is having a little trouble right now. Please try again later.";
  }
}

// Function to send a reply to the Facebook group using the Graph API
async function sendGroupReply(objectId, message) {
  if (!PAGE_ACCESS_TOKEN) {
    console.error("CRITICAL ERROR: The FACEBOOK_PAGE_ACCESS_TOKEN environment variable is missing.");
    return; // Don't even try to send a reply
  }
  
  const url = `https://graph.facebook.com/v19.0/${objectId}/comments`;
  const payload = {
    message: message,
    access_token: PAGE_ACCESS_TOKEN
  };

  try {
    await axios.post(url, payload);
    console.log(`Successfully replied to object ${objectId}`);
  } catch (error) {
    console.error("Error sending reply to Facebook:", error.response ? error.response.data.error.message : error.message);
  }
}


// --- SERVER STARTUP ---

// Basic homepage route to confirm the server is running.
// This is what Uptime Robot will check.
app.get('/', (req, res) => {
  res.send('Your bot server is running.');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
