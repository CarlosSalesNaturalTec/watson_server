// Node versão ^16
// npm init
// npm install: ibm-watson, express, formidable, cors, dotenv --save 
// Criar na raiz do projeto as pastas: \upload e \audio

const express = require("express")
const formidable = require('formidable')
const fs = require('fs')
const app = express()
const port = process.env.PORT || 3000
require('dotenv').config()

const url = require('url');
const getStat = require('util').promisify(fs.stat);
var idAudioFile = "";

//#region IBM Cloud Credenciais.
// ===============================================================
// IBM Cloud - Watson.
const { IamAuthenticator } = require('ibm-watson/auth');

// Create Speech to Text service object.
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const speechToText = new SpeechToTextV1({
    authenticator: new IamAuthenticator({
        apikey: process.env.STT_APIKEY,
    }),
    serviceUrl: process.env.STT_URL,
});
// parâmetros sobre audio enviado e da transcrição a ser realizada
const audioParams = {
    objectMode: false,    // recebe somente trasncrição do audio
    model: 'pt-BR_Multimedia', // pt-BR_Telephony
    lowLatency: true,       // caso TRUE, oferece menor tempo de resposta, porém pode produzir resultados menos apurados.
};

// Create Assistant service object.
const assistantId = process.env.ASSIST_ID;
const AssistantV2 = require('ibm-watson/assistant/v2');
const assistant = new AssistantV2({
    version: '2020-09-24',
    authenticator: new IamAuthenticator({
        apikey: process.env.ASSIST_APIKEY, 
    }),
    url: process.env.ASSIST_URL, 
});

// Create Text-to-Speech service object.
const TextToSpeechV1 = require('ibm-watson/text-to-speech/v1');
const textToSpeech = new TextToSpeechV1({
    authenticator: new IamAuthenticator({
        apikey: process.env.TTS_APIKEY,
    }),
    serviceUrl: process.env.TTS_URL ,
});
// ===============================================================
//#endregion

//#region CrossDomain.
// ===============================================================
// Opcional. Em caso de crossdomain
var corsOptions = {
    origin: process.env.CORS_URL,
    optionsSuccessStatus: 200
}
const cors = require('cors')
app.use(cors(corsOptions))
// ===============================================================
//#endregion

function transcreveAudio(path_audioFile, res) {
    // Cria um fluxo
    const recognizeStream = speechToText.recognizeUsingWebSocket(audioParams);
    // Canaliza o audio para o fluxo selecionado
    fs.createReadStream(path_audioFile).pipe(recognizeStream);
    // Encodding
    recognizeStream.setEncoding('utf8');

    // Transcrição ocorrida com sucesso
    recognizeStream.on('data', function (event) {
        deleteAudio(path_audioFile);
        let textoTranscrito = JSON.stringify(event, null, 2);
        obtemRespostaAssistant(textoTranscrito, res);
    });

    // Erro na Transcrição do Audio
    recognizeStream.on('error', function (event) {
        deleteAudio(path_audioFile);
        let textoTranscrito = "Erro na transcrição do áudio: " + JSON.stringify(event, null, 2);
        let resposta = "Erro na transcrição do audio";
        retorno(textoTranscrito, resposta, res)
    });
}

function obtemRespostaAssistant(textoTranscrito, res) {

    messageInput = {
        messageType: 'text',
        text: textoTranscrito,
    };

    let resposta = "Sem resposta do Assistente.";

    assistant
        .messageStateless({
            assistantId,
            input: messageInput,
        })
        .then(resultAssist => {
            let response = resultAssist.result;
            if (response.output.generic) {
                if (response.output.generic.length > 0) {
                    if (response.output.generic[0].response_type === 'text') {
                        resposta = response.output.generic[0].text;
                    }
                    if (response.output.generic[0].response_type === 'suggestion') {
                        resposta = response.output.generic[0].title;
                    }
                }
            }
            audioResposta(textoTranscrito, resposta, res)
        })
        .catch(err => {
            resposta = "Erro ao obter resposta do Assistente";
            audioResposta(textoTranscrito, resposta, res)
        });
}

function audioResposta(textoTranscrito, resposta, res) {

    const synthesizeParams = {
        text: resposta,
        accept: 'audio/mp3',
        voice: 'pt-BR_IsabelaV3Voice',
    };

    // Gera arquivo de audio com resposta
    textToSpeech.synthesize(synthesizeParams)
        .then(response => {
            const audio = response.result;
            const audioPath = "./audio/" + idAudioFile;
            audio.pipe(fs.createWriteStream(audioPath));
            retorno(textoTranscrito, resposta, res);
        })
        .catch(err => {
            let resposta = 'erro ao gerar Audio - TTS: ' + err;
            retorno(textoTranscrito, resposta, res);
        });

}

function deleteAudio(file) {
    fs.unlink(file, (err) => {
        if (err) {
            console.error("Erro ao tentar excluir arquivo de audio: ", err)
        }
    })
}

function retorno(textoTranscrito, resposta, res) {
    let ret = {
        watson_transcricao: textoTranscrito,
        watson_resposta: resposta,
        audio_file: idAudioFile
    };
    res.json(ret)
}

// Rota POST - Upload
app.post("/watson_server", (req, res) => {
    //Create an instance of the form object
    let form = new formidable.IncomingForm();
    var newpath = './uploads/';

    //Process the file upload in Node
    form.parse(req, function (error, fields, file) {
        let filepath = file.fileupload.filepath;
        newpath += file.fileupload.originalFilename + ".mp3";
        idAudioFile = file.fileupload.originalFilename + "_resposta.mp3"

        //Copy the uploaded file to a custom folder
        fs.rename(filepath, newpath, function () {
            transcreveAudio(newpath, res);
        });
    });
})

// Rota GET - Play Audio Resposta - Params : filename
app.get('/audio', async (req, res) => {
    const queryObject = url.parse(req.url, true).query;
    const filePath = './audio/' + queryObject.filename;
    const stat = await getStat(filePath);

    // informações sobre o tipo do conteúdo e o tamanho do arquivo
    res.writeHead(200, {
        'Content-Type': 'audio/mp3',
        'Content-Length': stat.size
    });

    const stream = fs.createReadStream(filePath);

    // faz streaming do audio 
    stream.pipe(res);
});

// Rota GET raiz
app.get('/', async (req, res) => {
    res.end("watson_server ON");
});

app.listen(port, () => {
    console.log("Servidor rodando na porta:" + port)
})