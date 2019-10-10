/*
    Yandex speechkit: https://cloud.yandex.ru/services/speechkit

    Speech-to-Text streaming example for NodeJS

    copyright (c) Meganet-2003 LLC, 2019 (Moscow, Russia)
    Authors:
        * Gorodilov Alexey @yandex-team
        * Nikolaev Dmitry <dn@mega-net.ru>
*/

var config = {
    host: 'stt.api.cloud.yandex.net',
    port: '443',
    folderId: '____PUT_YOUR_FOLDER_ID_HERE____',
    IAM_token: '____PUT_YOUR_IAM_TOKEN_HERE___',
    model: 'general',
    language_code: 'ru-RU',
    audio_encoding: 'LINEAR16_PCM',
    sample_rate_hertz: 16000,
    profanity_filter: false,
    partial_results: true
}

var fs = require('fs');
var sprintf = require("sprintf-js").sprintf;
var Writable = require('stream').Writable;
const os = require('os');

const PROTO_PATH = [__dirname + '/proto/stt_service.proto',__dirname + '/proto/status.proto'];

PROTO_PATH.forEach(function(proto, index, array){
    try{
	fs.lstatSync(proto).isFile();
    }
    catch(e){
	console.error(sprintf('[%s] file not found',proto));
	process.exit( 1 );
    }
});

yandex = false;
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
    var requestID = parseInt(new Date().getTime()/1000) + '-' + os.hostname();

    metadata = new grpc.Metadata();
    metadata.set('authorization', 'Bearer ' + config.IAM_token);
    metadata.set('X-Client-Request-ID',requestID);
    console.info(sprintf('Set sttService X-Client-Request-ID [%s]',requestID));

    var sttProto = grpc.loadPackageDefinition(packageDefinition).yandex.cloud.ai.stt.v2;

    var sslCreds = grpc.credentials.createSsl();
    var client = new sttProto.SttService(config.host + ':' + config.port, sslCreds);
    var sttService = client.StreamingRecognize(metadata);
    var sttServiceConfig = {
        config: {
            folder_id: config.folderId,
            specification: {
                model: config.model,
                language_code: config.language_code,
                audio_encoding: config.audio_encoding,
                sample_rate_hertz: config.sample_rate_hertz,
                profanity_filter: config.profanity_filter,
                partial_results: config.partial_results,
            }
        },
    };

    sttService.on('error', function (error) {
	console.error(sprintf("yandex error: code %s [%s]\n%s",error.code,error.message,error.stack));
	sttService.emit('shutdown');
    });
    sttService.on('end', function() {
	console.log("sttService event: end");
	sttService.emit('shutdown');
    });
    sttService.on('data', function (response) {
	console.log("\n=== RESPONSE START ===")
	if (response.chunks.length > 0) {
	    chunk = response.chunks[0].alternatives[0].text;
	    final = ( (response.chunks[0].final !== undefined) ? response.chunks[0].final : false );
	    console.log('Text: ' + chunk);
	    console.log('Is final: ' + final);
	}
	console.log("=== RESPONSE END ===")
    });
    sttService.once('shutdown',function(calledFrom){
	console.log('sttService emit event shutdown');
	if (typeof yandex.end == 'function'){
	    yandex.end();
	}
	if (typeof sttService.end == 'function'){
	    sttService.end(function(){
		console.log('sttService ended');
		client.close();
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

createSttClient(function(sttService){
    yandex = Writable({emitClose:true,autoDestroy:true});
    yandex._write = function (chunk, enc, next){
	if (!sttService.write({audio_content: chunk}, next)){
	    console.error("sttService.write returned false");
	}
    };
    yandex.on('finish', () => {
	console.info("yandex finished");
    });
    yandex.on('close', () => {
	console.info("yandex closed");
    });
    
    var startFrom = 0;
    if ((/\.wav$/.test(FILE_TO_OPEN))){
	startFrom = 44;
    }
    
    console.log('Read file',FILE_TO_OPEN);
    let reader = fs.createReadStream(FILE_TO_OPEN,{flags: 'r',autoClose: true, start: startFrom, highWaterMark: 320}).pause();
    reader.on('error', function () {
	console.error('reader return error');
	sttService.emit('shutdown');
    });
    reader.on('readable', function () {
	this.read();
    });
    reader.on('data', function(chunk){
	yandex.write(chunk);
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
