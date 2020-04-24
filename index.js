/* ---------- 初期化 ---------- */
require('dotenv').config();
const request = require('request');
const env = process.env;
const { App } = require('@slack/bolt');
const log4js = require('log4js');
log4js.configure({
  appenders: { system: { type: 'file', filename: './log/system.log' } },
  categories: { default: { appenders: ['system'], level: 'debug' } }
});
const logger = log4js.getLogger('system');

const token = process.env.SLACK_BOT_TOKEN
const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: token
});

async function getAccessToken(callback) {
  let headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/jwt',
      'Ocp-Apim-Subscription-Key': process.env.Azure_Translate_Text_key
  };
  let options = {
      url: 'https://translaterbot.cognitiveservices.azure.com/sts/v1.0/issuetoken',
      method: 'POST',
      headers: headers,
      json: true
  };

  request(options, function (err, res) {
      if (err) {
          console.log(err);
          callback(err, null);
      } else
          callback(null, res.body);
  });
}

async function translate(azureToken, text, toTranslate,  callback) {
  let base_url = 'https://api.microsofttranslator.com/v2/http.svc/Translate',
      appid = 'Bearer ' + azureToken,
      to = toTranslate;

  let url = base_url + '?appid=' + appid + 
              '&text=' + text + /*'&from=' + from +*/ '&to=' + to;
  let headers = {
      'Accept': 'application/xml'
  };

  let options = {
      url: encodeURI(url),
      method: 'get',
      headers: headers,
      json: true
  };

  request(options, function (err, res) {
      if (err) {
          console.log(err);
          callback(err, null);
      } else
          callback(null, res.body.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, ''));
  });
}

async function sleep(t) {
  return await new Promise(r => {
    setTimeout(() => {
      r();
    }, t);
  });
}

async function getMessage(channel, ts){
  return await app.client.conversations.replies({
    token: token,
    channel: channel,
    ts: ts
  });
}

async function checkReaction(reaction){
  let toTranslate;
  switch (reaction){
    case 'us':
    case 'flag-us':
    case 'gb':
    case 'flag-gb':
      toTranslate = 'en';
    break;
    case 'jp':
    case 'flag-jp':
      toTranslate = 'ja';
    break;
    case 'ph':
    case 'flag-ph':
      toTranslate = 'fil';
    break;

    default:
      toTranslate = false;
  }
  return toTranslate;
}

async function translateForAzure(originalText, toTranslate){
  await getAccessToken(function (err, azureToken) {
    if (!err) {
        // console.log(token);
        translate(azureToken, originalText, toTranslate, (err, translated) => {
            if (!err)
                console.log(originalText, '->', translated);
        });
    }
});
}

app.event('reaction_added', async ({ event, context }) => {
  try {
    const channelId = event.item.channel;
    const ts = event.item.ts;
    const reaction = event.reaction;
    
    const toTranslate = await checkReaction(reaction);
    if(toTranslate == false){
      throw new Error('Wrong Emoji');
    }

    const message = await getMessage(channelId, ts);
    const originalText = message.messages[0].text;
    
    await translateForAzure(originalText, toTranslate);

  } catch (error) {
    console.error(error);
  }
});


// Start your app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
