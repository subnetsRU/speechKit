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
const os = require('os');
const PROTO_PATH = [__dirname + '/proto/stt.proto'];

PROTO_PATH.forEach(function(proto, index, array){
    try{
	fs.lstatSync(proto).isFile();
    }
    catch(e){
	console.error(sprintf('[%s] file not found',proto));
	process.exit( 1 );
    }
});

tinkoff = false;
sttService = false;

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

function createSttClient(next){
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
    var requestID = parseInt(new Date().getTime()/1000) + '-' + os.hostname();

    auth_payload = {
       "iss": "test_issuer",
       "sub": "test_user",
       "aud": "tinkoff.cloud.stt"
    }

    var auth = generate_jwt(config.keys.api,config.keys.secret,auth_payload);
    metadata = new grpc.Metadata();
    metadata.set('authorization', 'Bearer ' + auth);
    metadata.set('X-Client-Request-ID',requestID);
    console.info(sprintf('Set sttService X-Client-Request-ID [%s]',requestID));

    var sttProto = grpc.loadPackageDefinition(packageDefinition).tinkoff.cloud.stt.v1;
    var sslCreds = grpc.credentials.createSsl();
    var client = new sttProto.SpeechToText(config.host + ':' + config.port, sslCreds);
    var sttService = client.StreamingRecognize(metadata);

    sttService.on('end', function() {
	console.log("sttService event: end");
    });
    sttService.on('metadata', function(metadata){
	//https://grpc.github.io/grpc/node/grpc.Metadata.html
	console.log(sprintf("sttService metadata response: %j",metadata));
    });
    sttService.on('status', function(status){
        // https://grpc.github.io/grpc/core/md_doc_statuscodes.html https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
        console.log(sprintf('sttService status response: [%j]',status));
    });
    sttService.on('error', function (error){
	console.error(sprintf("sttService error: code %s [%s]\n%s",error.code,error.message,error.stack));
	sttService.emit('shutdown');
    });
    sttService.on('data', function (response) {
	console.log("\n=== RESPONSE START ===")
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
    sttService.once('shutdown',function(calledFrom){
	console.log('sttService emit event shutdown');
	if (typeof tinkoff.end == 'function'){
	    tinkoff.end();
	}
	if (typeof sttService.end == 'function'){
	    sttService.end(function(){
		console.log('sttService ended');
		//client.close();
		process.exit(0);
	    });
	}else{
	    process.exit(0);
	}
    });

    sttService.write(sttServiceConfig);

    var deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 3);
    grpc.waitForClientReady(client, deadline, function(error){
	if (typeof error === 'undefined'){
	    console.log("sttService connected");
	    if (typeof next == "function"){
		next(sttService);
	    }else{
		console.error('Error: Callback is not a function');
		process.exit(1);
	    }
	}else{
	    console.log('Error: sttService not connected, connection timedout');
	    process.exit(1);
	}
    });
}

var base64 = function(){
    //based on https://www.npmjs.com/package/urlsafe-base64
/**
 * .encode
 *
 * return an encoded Buffer as URL Safe Base64
 *
 * Note: This function encodes to the RFC 4648 Spec where '+' is encoded
 *       as '-' and '/' is encoded as '_'. The padding character '=' is
 *       removed.
 *
 * @param {Buffer} buffer
 * @return {String}
 * @api public
 */
    var _encode = function _encode(buffer) {
	return buffer.toString('base64')
	    .replace(/\+/g, '-') // Convert '+' to '-'
	    .replace(/\//g, '_') // Convert '/' to '_'
	    .replace(/=+$/, ''); // Remove ending '='
    };

/**
 * .decode
 *
 * return an decoded URL Safe Base64 as Buffer
 *
 * @param {String}
 * @return {Buffer}
 * @api public
 */
    var _decode = function _decode(base64) {
	// Add removed at end '='
	base64 += Array(5 - base64.length % 4).join('=');
	base64 = base64
	    .replace(/\-/g, '+') // Convert '-' to '+'
	    .replace(/\_/g, '/'); // Convert '_' to '/'
	return new Buffer.from(base64, 'base64');
    };

/**
 * .validate
 *
 * Validates a string if it is URL Safe Base64 encoded.
 *
 * @param {String}
 * @return {Boolean}
 * @api public
 */

    var _validate = function _validate(base64) {
	return /^[A-Za-z0-9\-_]+$/.test(base64);
    };
    
    return {
	encode: function encode(text){
	    var buffer = Buffer.from(text);
	    return _encode(buffer);
	},
	decode: function decode(base64){
	    return _decode(base64).toString('utf8');
	},
	validate: function validate(base64){
	    return _validate(base64);
	}
    };
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

function generate_jwt(api_key, secret_key, payload){
    var b64 = base64();
    var expiration_time = 600;
    var header = {
        "alg": "HS256",
        "typ": "JWT",
        "kid": api_key
    }

    payload['exp'] = parseInt(new Date().getTime()/1000) + expiration_time;
    payload_bytes = JSON.stringify(payload);
    header_bytes = JSON.stringify(header);
    
    data = (b64.encode(header_bytes) + '.' + b64.encode(payload_bytes));
    decode_secret_key = b64.decode(pad_base64(secret_key));

    hmac = crypto.createHmac('sha256',decode_secret_key).update(data,'utf8').digest();
    signature = b64.encode(hmac);

    jwt = data + '.' + signature;

 return jwt;
}

createSttClient(function(sttService){
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

    var startFrom = 0;
    if ((/\.wav$/.test(FILE_TO_OPEN))){
	startFrom = 44;
    }
    
    console.log('Read file',FILE_TO_OPEN);
    let reader = fs.createReadStream(FILE_TO_OPEN,{flags: 'r',autoClose: true, start: startFrom, highWaterMark: 320}).pause();
    reader.on('error', function (e) {
	console.error('reader return error',e);
	sttService.emit('shutdown');
    });
    reader.on('readable', function () {
	this.read();
    });
    reader.on('data', function(chunk){
	tinkoff.write(chunk);
    });
    reader.on('end', function(){
	console.log(sprintf("\n******* Audio file [%s] ended *******",FILE_TO_OPEN));
	setInterval(function(){
	    console.log('\n******* Just waiting for more recognition results before exit *******\n');
	},1000);
	setTimeout(function(){
	    console.log('Going to exit');
	    sttService.emit('shutdown');
	},15000);
    });
});
