/*
    Tinkoff speechkit: https://voicekit.tinkoff.ru/

    Speech-to-Text streaming example for NodeJS
    copyright (c) Meganet-2003 LLC, 2019 (Moscow, Russia)
    Authors:
        * Nikolaev Dmitry <dn@mega-net.ru>
*/

fs = require('fs');
crypto = require('crypto');

const PROTO_PATH = [__dirname + '/proto/tts.proto'];
config = {
    host: 'tts.tinkoff.ru',
    port: '443',
    keys: {
	api: '________PUT_YOUR_APY_KEY_HERE________',
	secret: '_____PUT_YOUR_SECRET_KEY_HERE_____',
    }
}
GOT_DATA = false;

PROTO_PATH.forEach(function(proto, index, array){
    try{
	fs.lstatSync(proto).isFile();
    }
    catch(e){
	console.error('['+proto+'] file not found');
	process.exit( 1 );
    }
});

const argv = process.argv.slice(2);
if (argv.length != 1){
    console.error('Usage: /path/to/nodejs file.js text(utf-8)');
    process.exit( 1 );
}else{
    TEXT = argv[0];
    resultFilePath = __dirname + '/tts_' + parseInt(new Date().getTime()/1000) + '.raw';
    resultFile = fs.createWriteStream(resultFilePath, {autoClose: true, encoding: 'utf8', flags : 'w'});
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
	    //return _decode(base64).toString('utf8');		//can cause "Token is invalid" error on nodejs v12.12
	    return _decode(base64);
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
    //console.log('decode_secret_key',decode_secret_key.toString('utf8'));

    hmac = crypto.createHmac('sha256',decode_secret_key).update(data,'utf8').digest();
    signature = b64.encode(hmac);

    jwt = data + '.' + signature;

 return jwt;
}

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
    }
);

var ttsConfig = {
    input: {
	text: TEXT,
    },
    audio_config: {
	audio_encoding: 'LINEAR16',
	speaking_rate: 1.0,
	sample_rate_hertz: 48000,	//for now only 48k supported
    },
    voice: {
	language_code: "ru-RU",
	name: 'default',		//not implemented yet
	ssml_gender: 'MALE',	//not implemented yet
    },
};

console.log('Configuration',ttsConfig);

auth_payload = {
   "iss": "test_issuer",
   "sub": "test_user",
   "aud": "tinkoff.cloud.tts"
}

var auth = generate_jwt(config.keys.api,config.keys.secret,auth_payload);
metadata = new grpc.Metadata();
metadata.set('authorization', 'Bearer ' + auth);

var ttsProto = grpc.loadPackageDefinition(packageDefinition).tinkoff.cloud.tts.v1;
var sslCreds = grpc.credentials.createSsl();
var client = new ttsProto.TextToSpeech(config.host + ':' + config.port, sslCreds);

//ListVoices not implemented yet
console.log('Request list of voices');
ListVoicesRequest = {
    language_code: "ru-RU",
};

client.ListVoices(ListVoicesRequest, metadata,function(err, response) {
    if (err) {
	console.error('ListVoices error: code #%d msg %s',err.code,err.message);
    }else{
	console.log('ListVoices',response);
    }
});

console.log('Request Synthesize: '+TEXT);
var ttsService = client.StreamingSynthesize(ttsConfig,metadata);
ttsService.on('data', function (response) {
    if (response && response.audio_chunk && response.audio_chunk.length > 0){
	console.log('got '+response.audio_chunk.length+' bytes of audio data');
	resultFile.write(Buffer.from(response.audio_chunk));
	
	if (GOT_DATA === false){
	    GOT_DATA = true;
	}
    }else{
	console.log('No audio data in response:',response);
    }
});

ttsService.on('metadata', function(metadata) {
    console.log('got metadata',metadata);
});

ttsService.on('error', function (error) {
    console.error('error: code #'+error.code+' ['+error.message+']');
    console.log('Error stack:',error.stack);
    ttsService.emit('shutdown');
});

ttsService.on('end', function() {
    console.error('ttsService event end');
    ttsService.emit('shutdown');
});

ttsService.on('shutdown',function(){
    console.log('ttsService event shutdown');
    if (client.close == 'function'){
	client.close();
	console.log('ttsService closed');
    }
    if (GOT_DATA === true){
	console.log('Result in file '+resultFilePath);
    }
});
