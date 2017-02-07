'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const apiai = require('apiai');
const Q = require('q');
const app = express();

//apiai App with customer access token
const apiaiApp= apiai(process.env.apiaiApp);


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//page access token
var PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

//server web main page
app.get('/', function(req, res){
  res.send("welcome to PB hostetter");
})

//server webhook
app.get('/webhook', function(req, res){
  if(req.query['hub.mode'] && req.query['hub.verify_token'] === process.env.FB_VERIFY_TOKEN){
    res.status(200).send(req.query['hub.challenge']);
  }
  else{
    res.status(403).end();
  }
});

//message from FB customer
app.post('/webhook', function(req, res){
    if (req.body.object === 'page') {
        req.body.entry.forEach((entry) => {
          entry.messaging.forEach((event) => {
        if (event.message && event.message.text){
            let user_profile = getUserProfile(event);
            console.log(user_profile);
            MessageHandler(event);    
        };
      });
    });
    res.status(200).end();
  }
});

//handling message from FB event object.
function MessageHandler(event) {
  let sender = event.sender.id;
  let text = event.message.text;
//apiai text request
  let apiai = apiaiApp.textRequest(text, {
    sessionId: 'MY_HOSTETTER' // use any arbitrary id
  });

//get reponse from apiai
  apiai.on('response', (response) => {
    let apiaiText = response.result.fulfillment.speech;
    //let apiaiType = response.result.fulfillment.type;
    var apiaiMessages = response.result.fulfillment.messages;
    //console.log(user_profile.first_name + "sent : " + text);
    //response from agent or domain
    if(response.result.source == 'agent'){
      for(let i=0;i<apiaiMessages.length;i++){
        let amessage=apiaiMessages[i];
        let replymessage = null;
        //response from apiai agent
        //which type of response get
        switch(amessage.type){
          case 0 :
            //0 is text message
            console.log("ITS TEXT MESSAGE");
            replymessage = TextMessage(event, amessage);
            break;
          case 1 :
            //1 is card message
            console.log("ITS CARD MESSAGE");
            replymessage = CardMessage(event, amessage);
            break;
          case 2 :
            //2 is quick reply
            console.log("ITS QUICK REPLY");
            replymessage = QuickReply(event, amessage);
            break;
          case 3 :
            //3 is image mesaage
            console.log("ITS IMAGE MESSAGE");
            replymessage = ImageMessage(event, amessage);
            break;
          case 4 :
            //4 is custom payload
            console.log("ITS CUSTOM PAYLOAD");
            console.log(amessage.payload);
            replymessage = amessage.payload;
            break;
        }
        sendFBmessage(event, replymessage);
       }
    }else{
      console.log("ITS DOMAIN SAYING");
      replymessage = TextMessage(event, amessage);
      sendFBmessage(event, replymessage);
    }
  });
  
  //if apiai gets error
  apiai.on('error', (error) => {
    console.log(error);
  });

  //apiai end
  apiai.end();
}

function sendingActionOn(event){
  let sender = event.sender.id;

  request({
      url: 'https://graph.facebook.com/v2.6/me/messages',
      qs: {access_token: PAGE_ACCESS_TOKEN},
      method: 'POST',
      json:{
        recipient: {id:sender},
        sender_action: "TYPING_ON"
      }
    }, (error, response) => {
      if(error){
        console.log('Error : ', error);
      }else if(response.body.error) {
        console.log('Error : ', response.body.error);
      }else{
        console.log("SENDING ACTION ON");
      }
    });
}

function sendingActionOff(event){
  let sender = event.sender.id;

  request({
      url: 'https://graph.facebook.com/v2.6/me/messages',
      qs: {access_token: PAGE_ACCESS_TOKEN},
      method: 'POST',
      json:{
        recipient: {id:sender},
        sender_action: "TYPING_OFF"
      }
    }, (error, response) => {
      if(error){
        console.log('Error : ', error);
      }else if(response.body.error) {
        console.log('Error : ', response.body.error);
      }else{
        console.log("SENDING ACTION OFF");
      }
    });
}



function sendFBmessage(event, replymessage){
  let sender = event.sender.id;

  sendingActionOn(event);
  console.log("TYPEING ON ");

  request({
      url: 'https://graph.facebook.com/v2.6/me/messages',
      qs: {access_token: PAGE_ACCESS_TOKEN},
      method: 'POST',
      json:{
        recipient: {id:sender},
        message: replymessage
      }
    }, (error, response) => {
      if(error){
        console.log('Error : ', error);
      }else if(response.body.error) {
        console.log('Error : ', response.body.error);
      }else{
        console.log("Send Message Complete");
      }
    });
}

//send text message to FB customer with apiai response
function TextMessage(event, amessage){
  let sender = event.sender.id;

  let replymessage = [];

  replymessage = {
    "text":amessage.speech
  }

  return replymessage;
}

function ImageMessage(event, amessage){

  let sender = event.sender.id;
  let replymessage = [];

  replymessage = {
    "attachment":{
      "type":"image",
      "payload":{
        "url":amessage.imageUrl
      }
    }
  }
  return replymessage;
}

function QuickReply(event, amessage){
  let sender = event.sender.id;

  var replymessage = [];

  for(let i=0; i<amessage.replies.length; i++){
    replymessage.push({
      "content_type":"text",
      "title":amessage.replies[i],
      "payload":amessage.replies[i]
    });
  }

  replymessage = {
    "text":amessage.title,
    "quick_replies":replymessage
  };

  return replymessage;
}

function CardMessage(event, amessage){

  let sender = event.sender.id;
  let replymessage = [];

  //if card message have buttons
  if(amessage.buttons.length != 0){
    let buttons = [];
    for(let j=0;j<amessage.buttons.length;j++){
      buttons.push({
        "type":"web_url",
        "url":amessage.buttons[j].postback,
        "title":amessage.buttons[j].text
      });
    };
    replymessage = {
      "elements":[{
        "buttons":buttons
      }]
    }
  }
  //if needs whether have buttons or not.
  replymessage = {
      "attachment":{
        "type":"template",
        "payload":{
          "template_type":"generic",
          "elements":[{
            "title":amessage.title,
            "image_url":amessage.imageUrl,
            "subtitle":amessage.subtitle
          }]
        }
      }
    }
  return replymessage;
}

/*
function getUserProfile(event){
  var sender = event.sender.id;
  var obj = [];
  var graphUrl = 'https://graph.facebook.com/v2.6/'+sender+'?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token='+ PAGE_ACCESS_TOKEN;

  request(graphUrl, function(err, res, body){
    obj = JSON.parse(body);
    
  })
  return obj;
}
*/



//express server connectings
const server = app.listen(process.env.PORT || 5000, () => {
  console.log('Express server listening on port %d in %s mode', server.address().port, app.settings.env);
});