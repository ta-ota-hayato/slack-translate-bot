/* ---------- 初期化 ---------- */
require('dotenv').config();


const express = require("express");
const fs = require("fs");
const rp = require("request-promise");
const expressApp = express();
const helpers = require("./helpers");

expressApp.get("/redirect", (req, res) => {
  console.log(req.query.state);
  // DO: verify that `req.query.state` is the same as your App provided when the flow was initialized

  if (!req.query.code) {
    // access denied
    console.log("Access denied");
    return;
  }

  let params = {
    client_id: process.env.SLACK_CLIENT_ID,
    client_secret: process.env.SLACK_CLIENT_SECRET,
    redirect_uri: process.env.SLACK_REDIRECT_URL,
    code: req.query.code
  };

  return rp({
    url: helpers.getUrlWithParams("https://slack.com/api/oauth.v2.access", params),
    method: "GET"
  })
    .then(result => {
      let slackData = JSON.parse(result);

      if (!slackData) throw new Error("Invalid Slack API data received");
      if (!slackData.ok) throw new Error(slackData.error);

      // DO: Store Access Tokens in your Database

      console.log(slackData);

      return res.sendStatus(200);

      // DO: Show a nicer web page or redirect to the Slack workspace instead of just returning 200 OK
    })
    .catch(err => {
      console.log(err);
      return res.send({ error: err.message });
    });
});


/* This simple app uses the '/translate' resource to translate text from
one language to another. */

/* This template relies on the request module, a simplified and user friendly
way to make HTTP requests. */
const request = require('request');
const uuidv4 = require('uuid/v4');

var key_var = 'TRANSLATOR_TEXT_SUBSCRIPTION_KEY';
if (!process.env[key_var]) {
    throw new Error('Please set/export the following environment variable: ' + key_var);
}
var subscriptionKey = process.env[key_var];
var endpoint_var = 'TRANSLATOR_TEXT_ENDPOINT';
if (!process.env[endpoint_var]) {
    throw new Error('Please set/export the following environment variable: ' + endpoint_var);
}
var endpoint = process.env[endpoint_var];
var region_var = 'TRANSLATOR_TEXT_REGION_AKA_LOCATION';
if (!process.env[region_var]) {
    throw new Error('Please set/export the following environment variable: ' + region_var);
}
var region = process.env[region_var];

/* If you encounter any issues with the base_url or path, make sure that you are
using the latest endpoint: https://docs.microsoft.com/azure/cognitive-services/translator/reference/v3-0-translate */
async function translateText(text, toTranslate){
    let options = {
        method: 'POST',
        baseUrl: endpoint,
        url: 'translate',
        qs: {
          'api-version': '3.0',
          'to': toTranslate
        },
        headers: {
          'Ocp-Apim-Subscription-Key': subscriptionKey,
          'Ocp-Apim-Subscription-Region': region,
          'Content-type': 'application/json',
          'X-ClientTraceId': uuidv4().toString()
        },
        body: [{
              'text': text
        }],
        json: true,
    };

    let result = await doRequest(options);
    //console.log(JSON.stringify(result, null, 4));
    return result[0]['translations'][0]['text']
};
function doRequest(options){
  return new Promise(function (resolve, reject){
    request(options, function(error, res, body){
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
      });
    });
}


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

    let translated = await translateText(originalText, toTranslate);

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
