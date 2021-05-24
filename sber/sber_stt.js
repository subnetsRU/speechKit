/*
 *  Full documentation: https://developer.sberdevices.ru/docs/ru/smartservices/recognition_smartspeech
 *
 *  node.js speech recognition example client
 *  proto file location: https://github.com/sberdevices/smartspeech/blob/master/recognition/v1/recognition.proto
 *
 *  СПАСИБО команде Сбера за помощь в подготовке данного примера!
 *
 */

var config = {
    host: 'smartspeech.sber.ru',
    port: '443',
    JWE: '',	// <-- сюда вставляем access_token, который получаем как описано тут: https://developer.sberdevices.ru/docs/ru/smartservices/authentication_smartspeech
		// пример access_token: eyJjxHkiOiJYx3YiLCJlbmMiOiJBMjU2Y0JxLUhTNTEyIiwiYWxnIjoiUlNBLU9BRVAtMjU2In0.xxS82eJc2WmfgvOstErjM7e2903ghk7MOBBsWTHL4Vxx8nSe-pOIwNymGhU1Lre3wmo3x2t0xaxYzI-xYAvSJ50FZYtjlUCNJK68v3kXE2zYSb4s1EXroYY-iFGn0TisO7Jgm89GJWLKAmOY2o5-7mMVYMFkLBwyx7Yl40jASmtTe-sNMsOygrxMHMhxYmKml2YCjn3f1NUoxx6usZ6heel-jb8xYMMCXPmVpCnkfEr5gYOp04n-H1ixA0uWMxMVtGk-h7uVf3VLUxGXxi2grJ5m-SfpwKLBa-13Cye2aIJoaISajTBPYWxzR7fKiYPigfCYshm7P8fcgOFej5szOY.t5XjRS-5zxaotGNB7SYlrg.3-ieC6S3PhGioxT-YN88JXxyUJC9mtxWsmBzCpYvMB49C5rT9YpzN9wgIsvpLYGIW-YiAioeyN9VwL5WAkEigUrglWvxoreuSwS6fpE-woki8NHRIeST0ixIePveCiNpbZ2b9Y-bctLJ5yt4gGsmYyMFXExaAxrETYBojivcAKsBwVIZtEmVw6UYRN0l7vCYwajhR-ZxxMHLxxxBtUEcagxhy7mJ8wx3c0WakxOyt708LTXI8YsneRMNaAxrHyYxR-LBxxr84xr-ylUIYogOYaIPFK4tVJW2krWkiheOxNUpYsYYfyguzkAFGxGMCI72lKlVvooXlRlS-IxEcWigYCYj0segio1esbm2HK-CNIElhU483Ofwex17TPF4gfCUi71WkI8TeRkNL1f2V1fGxCgcNWEsPiV9YAYC5tv7wxNyYt4k3x9He6P9sxCYjZKE5CKiXntigVIbO--Zz-f--pZ0Jn7TYx02855Gr78UF7bG5lNhFJpx3mrIYtefNIskZj80k8jTBkltkM-RoSOPSIJ58BbXr6x-JR3exMYWp7mo7gvhf-eTU3KAxwFvNvPBUYY6a6UAyKu5YOBgxIfSN5airlGeiTSP_4tgfUm9pYgWJxU2MghPngoRwOYL2ucYGLVjiMYuI-H21fnIso3I9zc9V5fa3zOVYxC8wwyu0Ii7PJWs9ukyJ7hgHesBTh29YM7CYNUPfiluERRgzLiaolYirHpuRl-yWfgN0j4iI1s.O33-LTBeEuEzxO71u0btmrAAaPIHHuoRACAYfpzT40E
    language: 'ru-RU',
    model: 'general',
    audio_encoding: 'PCM_S16LE',
    sample_rate: 16000,
    enable_partial_results: true,
}

var fs = require('fs');
var sprintf = require("sprintf-js").sprintf;
var Writable = require('stream').Writable;
const os = require('os');

const PROTO = __dirname + '/proto/sber.proto';

try{
	fs.lstatSync(PROTO).isFile();
} catch(e) {
	console.error(sprintf('proto file %s not found', proto));
	process.exit(1);
}

const argv = process.argv.slice(1);
if (argv.length != 2){
    console.error('Usage:');
    console.error(sprintf('# /path/to/nodejs %s /path/to/audio.raw',argv[0]));
    console.error('\tOR');
    console.error(sprintf('# /path/to/nodejs %s /path/to/audio.wav',argv[0]));
    process.exit( 1 );
}else{
    FILE_TO_OPEN = argv[1];
}

var smartspeech = false

function connectToSmartSpeech(next){
  var grpc = require('grpc');
  var protoLoader = require('@grpc/proto-loader');
  var packageDefinition = protoLoader.loadSync(
      PROTO,
      {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true
      });

  metadata = new grpc.Metadata();
  metadata.set('authorization', 'Bearer ' + config.JWE);

  var proto = grpc.loadPackageDefinition(packageDefinition).smartspeech.recognition.v1;

  var sslCreds = grpc.credentials.createSsl();
  var service = new proto.SmartSpeech(config.host + ':' + config.port, sslCreds);
  var call = service.Recognize(metadata);
  var options = {
      options: {
              model: config.model,
              language: config.language,
              audio_encoding: config.audio_encoding,
              sample_rate: config.sample_rate,
              enable_partial_results: config.enable_partial_results,
      },
  };

  call.on('metadata', function (metadata) {
    console.info(metadata);
  });

  call.on('error', function (error) {
    console.error(sprintf("Error: code %s [%s]\n%s", error.code, error.message, error.stack));
    call.emit('shutdown');
  });

  call.on('end', function() {
    console.log("SmartSpeech event: end");
    call.emit('shutdown');
  });

  call.on('data', function (response) {
    console.log("\n=== RESPONSE START ===")
    //console.log(response);
    if (response.results && response.results.length > 0) {
      result = response.results[0].text;
      final = response.eou
      console.log('Text: ' + result);
      console.log('Is final: ' + final);
    }

    console.log("=== RESPONSE END ===")
  });
  call.once('shutdown',function(calledFrom){
    console.log('SmartSpeech emit event shutdown');
    if (typeof smartspeech.end == 'function'){
	smartspeech.end();
    }

  if (typeof call.end == 'function'){
      call.end(function(){
        console.log('SmartSpeech session ended');
        service.close();
        process.exit(0);
      });
  } else {
      process.exit(0);
  }});

  var deadline = new Date();
  deadline.setSeconds(deadline.getSeconds() + 3);
  grpc.waitForClientReady(service, deadline, function(error){
    if (typeof error === 'undefined'){
      console.log("SmartSpeech connected");

      if (typeof next == "function"){
        console.log('Sending options')
        call.write(options, function () {next(call)});
      } else {
        console.error('Error: Callback is not a function');
        process.exit(1);
      }
    } else {
      console.log('Error: SmartSpeech not connected, connection timedout');
      process.exit(1);
    }
  });
}

connectToSmartSpeech(function(client){
  smartspeech = Writable({
    emitClose: true,
    autoDestroy: true
  });

  smartspeech._write = function (chunk, enc, next){
    if (!client.write({audio_chunk: chunk}, next)){
        console.error("client.write returned false");
    } else {
      //console.info('sent chunk')
    }
  };

  smartspeech.on('finish', () => {
    console.info("finished");
  });

  smartspeech.on('close', () => {
    console.info("closed");
    process.exit(0);
  });
  
  var startFrom = 0;
  if ((/\.wav$/.test(FILE_TO_OPEN))){
    startFrom = 44;
  }
  
  console.log('Read file',FILE_TO_OPEN);
  let reader = fs.createReadStream(FILE_TO_OPEN,{flags: 'r',autoClose: true, start: startFrom, highWaterMark: 320}).pause();
  reader.on('error', function () {
    console.error('reader return error');
    client.emit('shutdown');
  });

  reader.on('readable', function () {
    this.read();
  });

  reader.on('data', function(chunk){
      smartspeech.write(chunk);
  });

  reader.on('end', function(){
	client.end();
	console.log(sprintf("\n******* Audio file [%s] ended *******",FILE_TO_OPEN));
	setInterval(function(){
	    console.log('\n******* Just waiting for recognition results before exit *******\n');
	},1000);
    });
});
