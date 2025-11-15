const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(bodyParser.json());

// --- YOUR TOKENS AND SECRETS ---
const VERIFY_TOKEN = "@Golapi2018"; // Put your Verify Token here
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- INITIALIZE AI ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- WEBHOOK ENDPOINTS ---
// Verification endpoint
app.get('/webhook', (req, res) => {
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Event handler endpoint
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('Received webhook:', JSON.stringify(body, null, 2));

  if (body.object === 'group') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === 'comments' || change.field === 'posts') {
          const messageObject = change.value;
          const userMessage = messageObject.message;
          const objectId = messageObject.post_id || messageObject.comment_id;

          if (userMessage) {
            console.log(`Received message: "${userMessage}" on object ${objectId}`);
            
            // Get AI response
            const aiResponse = await getAiResponse(userMessage);

            // Reply to the post/comment
            await sendGroupReply(objectId, aiResponse);
          }
        }
      }
    }
  }
  res.status(200).send('EVENT_RECEIVED');
});


// --- AI FUNCTION ---
async function getAiResponse(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Cost-effective and fast
      messages: [
        { role: "system", content: "You are a helpful assistant in a Facebook group. Keep your answers brief and friendly." },
        { role: "user", content: prompt }
      ],
    });
    const aiMessage = completion.choices[0].message.content;
    console.log("AI Response:", aiMessage);
    return aiMessage;
  } catch (error) {
    console.error("Error getting AI response:", error);
    return "Sorry, I had a problem thinking of a response.";
  }
}

// --- FACEBOOK REPLY FUNCTION ---
async function sendGroupReply(objectId, message) {
  // The objectId could be a post_id or a comment_id. Facebook API can handle both.
  const url = `https://graph.facebook.com/v19.0/${objectId}/comments`;
  const payload = {
    message: message,
    access_token: PAGE_ACCESS_TOKEN
  };

  try {
    await axios.post(url, payload);
    console.log(`Successfully replied to object ${objectId}`);
  } catch (error) {
    console.error("Error sending reply to Facebook:", error.response ? error.response.data : error.message);
  }
}

// --- START SERVER ---
app.listen(process.env.PORT || 3000, () => console.log('Server is listening.'));
