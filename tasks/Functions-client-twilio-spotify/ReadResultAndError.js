const { decodeResult } = require("@chainlink/functions-toolkit")
const path = require("path")
const process = require("process")

task(
  "read-response",
  "Reads the latest response (or error) returned to a FunctionsConsumer or AutomatedFunctionsConsumer consumer contract"
)
  .addParam("contract", "Address of the consumer contract to read")
  .addOptionalParam(
    "configpath",
    "Path to Functions request config file",
    `${__dirname}/../../Functions-request-config.js`,
    types.string
  )
  .setAction(async (taskArgs) => {
    if (network.name === "hardhat") {
      throw Error(
        'This command cannot be used on a local hardhat chain.  Specify a valid network or simulate a RecordLabel request locally with "npx hardhat functions-simulate".'
      )
    }

    console.log(`Reading data from Functions consumer contract ${taskArgs.contract} on network ${network.name}`)
    const consumerContractFactory = await ethers.getContractFactory("RecordLabel")
    const consumerContract = await consumerContractFactory.attach(taskArgs.contract)

    let latestError = await consumerContract.latestError()
    if (latestError.length > 0 && latestError !== "0x") {
      const errorString = Buffer.from(latestError.slice(2), "hex").toString()
      console.log(`\nOn-chain error message: ${errorString}`)
    }

    let latestResponse = await consumerContract.latestResponse()
    if (latestResponse.length > 0 && latestResponse !== "0x") {
      // decode the hex string response using the expected return type from the request config.
      const requestConfig = require(path.isAbsolute(taskArgs.configpath)
        ? taskArgs.configpath
        : path.join(process.cwd(), taskArgs.configpath))
      console.log(
        `\nOn-chain response represented as a hex string: ${latestResponse}\nAnd decoded: ${decodeResult(
          latestResponse,
          requestConfig.expectedReturnType
        ).toString()}`
      )
    } else if (latestResponse == "0x") {
      console.log("Empty response: ", latestResponse)
    }
  })
