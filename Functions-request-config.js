const fs = require("fs")
const { Location, ReturnType, CodeLanguage } = require("@chainlink/functions-toolkit")

// Loads environment variables from .env.enc file (if it exists)
require("@chainlink/env-enc").config()

// Soundchart Artist IDs for sandbox are available from https://doc.api.soundcharts.com/api/v2/doc/sandbox-data
const BILLIE_EILISH = "11e81bcc-9c1c-ce38-b96b-a0369fe50396"
const TONES_AND_I = "ca22091a-3c00-11e9-974f-549f35141000"

const requestConfig = {
  // String containing the source code to be executed
  source: fs.readFileSync("./Twilio-Spotify-Functions-Source-Example.js").toString(),
  //source: fs.readFileSync("./API-request-example.js").toString(),
  // Location of source code (only Inline is currently supported)
  codeLocation: Location.Inline,
  // Optional. Secrets can be accessed within the source code with `secrets.varName` (ie: secrets.apiKey). The secrets object can only contain string values.
  secrets: {
    // DON level API Keys
    soundchartAppId: process.env.SOUNDCHART_APP_ID,
    soundchartApiKey: process.env.SOUNDCHART_API_KEY,
    twilioApiKey: process.env.TWILIO_API_KEY,
  },
  // Optional if secrets are expected in the sourceLocation of secrets (only Remote or DONHosted is supported)
  secretsLocation: Location.Remote,
  // Args (string only array) can be accessed within the source code with `args[index]` (ie: args[0]).
  args: [TONES_AND_I, "Tones&I", "1000", process.env.ARTIST_EMAIL, process.env.VERIFIED_SENDER], // init with 1000 listeners
  // Code language (only JavaScript is currently supported)
  codeLanguage: CodeLanguage.JavaScript,
  // Expected type of the returned value
  expectedReturnType: ReturnType.int256,
}

module.exports = requestConfig
