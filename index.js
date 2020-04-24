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

function doRequest(options) {
  return new Promise(function (resolve, reject) {
    request(options, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}

async function getAccessToken() {
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
 let azureToken = await doRequest(options);
 return azureToken;
}

async function translate(azureToken, text, toTranslate) {
  let base_url = 'https://api.microsofttranslator.com/v2/http.svc/Translate',
      appid = 'Bearer ' + azureToken,
      to = toTranslate;

  let url = base_url + '?appid=' + appid + 
              '&text=' + text + '&to=' + to;
  let headers = {
      'Accept': 'application/xml'
  };

  let options = {
      url: encodeURI(url),
      method: 'get',
      headers: headers,
      json: true
  };
 let resultText = await doRequest(options);
 return resultText.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '');
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
  let azureToken = await getAccessToken();
  let translatedText = await translate(azureToken, originalText, toTranslate);
  return translatedText;
}

async function postMessage(channel, text, ts){
  await app.client.chat.postMessage({
    token: token,
    channel: channel,
    text: text,
    thread_ts: ts
  })
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
    let prefix = 'This Message translated to ' + toTranslate; 

    const message = await getMessage(channelId, ts);
    
    //スレッド内では多重投稿を防げない
    for(let i in message.messages){
      if(message.messages[i].text.substring(0, prefix.length) == prefix){
        throw new Error('Already translated');
      }
    }

    const thread_ts = message.messages[0].thread_ts;
    const originalText = message.messages[0].text;
    
    let translated = await translateForAzure(originalText, toTranslate);
    
    if(thread_ts == undefined){
      await postMessage(channelId, prefix + '\n' + translated, ts);  
    }else{
      await postMessage(channelId, prefix + '\n' + translated, thread_ts);
    }
  } catch (error) {
    logger.error(error);
    console.error(error);
  }
});


// Start your app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
