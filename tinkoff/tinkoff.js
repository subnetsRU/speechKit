#!/usr/local/bin/node
/*
    Tinkoff speechkit: https://voicekit.tinkoff.ru/

    Speech-to-Text streaming example for NodeJS
    copyright (c) Meganet-2003 LLC, 2019 (Moscow, Russia)
    Authors:
        * Nikolaev Dmitry <dn@mega-net.ru>
*/

var config = {
    host: 'stt.tinkoff.ru',
    port: '443',
    keys: {
	api: '________PUT_YOUR_APY_KEY_HERE________',
	secret: '_____PUT_YOUR_SECRET_KEY_HERE_____',
    }
}

var fs = require('fs');
var sprintf = require("sprintf-js").sprintf;
var Writable = require('stream').Writable;
var crypto = require('crypto');

const PROTO_PATH = [__dirname + '/proto/stt.proto'];

PROTO_PATH.forEach(function(proto, index, array){
    try{
	fs.lstatSync(proto).isFile();
    }
    catch(e){
	console.error(sprintf('[%s] file not found',proto));
    }
});

tinkoff = false;
sttService = false;

const argv = process.argv.slice(1);
if (argv.length != 2){
    console.error(sprintf('Usage: /path/to/nodejs %s /full/path/to/audio.raw',argv[0]));
    process.exit( 1 );
}else{
    FILE_TO_OPEN = argv[1];
}

function tinkoff_connect(){
    sttService = createSttClient();
    console.log("sttService connected");
    
    tinkoff = Writable({emitClose:true,autoDestroy:true});
    tinkoff._write = function (chunk, enc, next){
	if (!sttService.write({audio_content: chunk}, next)){
	    console.error("sttService.write returned false");
	}
    };
    tinkoff.on('finish', () => {
	console.info("tinkoff finished");
    });
    tinkoff.on('close', () => {
	console.info("tinkoff closed");
    });
    
    sttService.on('data', function (response) {
	for (let item of response.results){
	    console.log("Channel", item.recognition_result.channel);
	    console.log("Phrase start", item.recognition_result.start_time);
	    console.log("Phrase end", item.recognition_result.end_time);
	    console.log("Is final", item.is_final);
	    for (let alternative of item.recognition_result.alternatives){
		console.log("Transcription", alternative.transcript);
		console.log("Confidence", alternative.confidence);
		console.log("------------------")
	    }
	}
	console.log("=== RESPONSE END ===")
    });
 return true;
}

function createSttClient(){
    const FORMAT_PCM = 'LINEAR16';
    var grpc = require('grpc');
    var protoLoader = require('@grpc/proto-loader');
    var packageDefinition = protoLoader.loadSync(
        PROTO_PATH,
        {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    
    var sttServiceConfig = {
	streaming_config: {
	    config: {
		encoding: FORMAT_PCM,
		sample_rate_hertz: 16000,
		language_code: "ru-RU",
		max_alternatives: 3,
		num_channels: 1,
	    },
            interim_results_config:{
                enable_interim_results: true,
                interval: 2,
            },
	}
    };

    auth_payload = {
       "iss": "test_issuer",
       "sub": "test_user",
       "aud": "tinkoff.cloud.stt"
    }

    var auth = generate_jwt(config.keys.api,config.keys.secret,auth_payload);
    metadata = new grpc.Metadata();
    metadata.set('authorization', 'Bearer ' + auth);

    var sttProto = grpc.loadPackageDefinition(packageDefinition).tinkoff.cloud.stt.v1;
    var sslCreds = grpc.credentials.createSsl();
    var client = new sttProto.SpeechToText(config.host + ':' + config.port, sslCreds);
    var sttService = client.StreamingRecognize(metadata);

    sttService.on('end', function() {
	console.log("sttService event: end");
    });
    sttService.on('metadata', function(metadata){
	//https://grpc.github.io/grpc/node/grpc.Metadata.html
        console.info(sprintf("sttService metadata response:\ndate: %s\nserver: %s\nx-request-id: %s",metadata.get('date'),metadata.get('server'),metadata.get('x-request-id')));
    });
    sttService.on('status', function(status){
        // https://grpc.github.io/grpc/core/md_doc_statuscodes.html https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
        console.log(sprintf('sttService got status message [%j]',status));
    });
    sttService.on('error', function (error){
	console.error(sprintf("sttService error: code %s [%s]\n%s",error.code,error.message,error.stack));
	sttService.emit('shutdown');
    });
    sttService.on('shutdown',function(calledFrom){
	console.log('sttService emit event shutdown');
	if (typeof tinkoff.end == 'function'){
		tinkoff.end();
	}
	if (sttService.end == 'function'){
	    console.log('sttService end');
	    sttService.end();
	}
	process.exit();
    });

    sttService.write(sttServiceConfig);

    return sttService;
}

function generate_jwt(api_key, secret_key, payload){
    expiration_time = 600;
    header = {
        "alg": "HS256",
        "typ": "JWT",
        "kid": api_key
    }

    payload['exp'] = parseInt(new Date().getTime()/1000) + expiration_time;
    payload_bytes = JSON.stringify(payload);
    header_bytes = JSON.stringify(header);
    
    data = (Buffer.from(header_bytes).toString('base64') + '.' + Buffer.from(payload_bytes).toString('base64'));
    b_secret_key = pad_base64(secret_key);
    decode_secret_key = new Buffer.from(pad_base64(secret_key), 'base64').toString('utf8');

    hmac = crypto.createHmac('sha256',decode_secret_key).update(data,'utf8').digest();
    signature = Buffer.from( hmac ).toString('base64');

    jwt = data + '.' + signature;

 return jwt;
}

function pad_base64(base64_str){
    len = base64_str.length;
    num_equals_signs = 4 - len % 4;
    
    if (num_equals_signs < 4){
	equals_signs = ''; 
	for(i=0;i<num_equals_signs;i++){
	    equals_signs += '=';
	}
	return base64_str + equals_signs;
    }
    
 return base64_str;
}

if (tinkoff_connect()){
    let reader = fs.createReadStream(FILE_TO_OPEN,{highWaterMark:320}).pause();
    reader.on('error', function () {
	console.error('reader return error');
	sttService.emit('shutdown');
    });
    reader.on('readable', function () {
	this.read();
    });
    reader.on('data', function(chunk){
	tinkoff.write(chunk);
    });
    reader.on('end', function(){
	console.log("\nReader ended, close connection and exit");
	sttService.emit('shutdown');
	console.log('Done');
	process.exit( 0 );
    });
}