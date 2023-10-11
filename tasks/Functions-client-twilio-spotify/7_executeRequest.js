const {
  SubscriptionManager,
  SecretsManager,
  createGist,
  deleteGist,
  simulateScript,
  decodeResult,
  ResponseListener,
  Location,
} = require("@chainlink/functions-toolkit")
const { networks } = require("../../networks")
const utils = require("../utils")
const chalk = require("chalk")
const path = require("path")
const process = require("process")
const fs = require("fs")

task("execute-functions-request", "Initiates an on-demand request from the consumer contract")
  .addParam("contract", "Address of the consumer contract to call")
  .addParam("subid", "Billing subscription ID used to pay for the request")
  .addOptionalParam(
    "callbackgaslimit",
    "Maximum amount of gas that can be used to call fulfillRequest in the consumer contract",
    100_000,
    types.int
  )
  .addOptionalParam("requestgaslimit", "Gas limit for calling the sendRequest function", 1_500_000, types.int)
  .addOptionalParam(
    "configpath",
    "Path to Functions request config file - defaults to Functions-request-config.js in project root",
    `${__dirname}/../../Functions-request-config.js`,
    types.string
  )
  .setAction(async (taskArgs, hre) => {
    // Get the required parameters
    const consumerAddr = taskArgs.contract
    const subscriptionId = parseInt(taskArgs.subid)
    const slotId = parseInt(taskArgs.slotid)
    const callbackGasLimit = parseInt(taskArgs.callbackgaslimit)

    // Attach to the FunctionsConsumer contract
    const consumerFactory = await ethers.getContractFactory("RecordLabel")
    const consumerContract = consumerFactory.attach(consumerAddr)

    // Get requestConfig from the specified config file
    const requestConfig = require(path.isAbsolute(taskArgs.configpath)
      ? taskArgs.configpath
      : path.join(process.cwd(), taskArgs.configpath))

    // Simulate the request
    if (taskArgs.simulate) {
      const { responseBytesHexstring, errorString } = await simulateScript(requestConfig)
      if (responseBytesHexstring) {
        console.log(
          `\nResponse returned by script during local simulation: ${decodeResult(
            responseBytesHexstring,
            requestConfig.expectedReturnType
          ).toString()}\n`
        )
      }
      if (errorString) {
        console.log(`\nError returned by simulated script:\n${errorString}\n`)
      }

      console.log("Local simulation of source code completed...")
    }

    // Initialize the subscription manager
    const signer = await ethers.getSigner()
    const linkTokenAddress = networks[network.name]["linkToken"]
    const functionsRouterAddress = networks[network.name]["functionsRouter"]
    const subManager = new SubscriptionManager({ signer, linkTokenAddress, functionsRouterAddress })
    await subManager.initialize()

    // Initialize the secrets manager
    const donId = networks[network.name]["donId"]
    const secretsManager = new SecretsManager({ signer, functionsRouterAddress, donId })
    await secretsManager.initialize()

    // Validate the consumer contract has been authorized to use the subscription
    const subInfo = await subManager.getSubscriptionInfo(subscriptionId)
    if (!subInfo.consumers.map((c) => c.toLowerCase()).includes(consumerAddr.toLowerCase())) {
      throw Error(`Consumer contract ${consumerAddr} has not been added to subscription ${subscriptionId}`)
    }

    // Estimate the cost of the request fulfillment
    const { gasPrice } = await hre.ethers.provider.getFeeData()
    const gasPriceWei = BigInt(Math.ceil(hre.ethers.utils.formatUnits(gasPrice, "wei").toString()))
    const estimatedCostJuels = await subManager.estimateFunctionsRequestCost({
      donId,
      subscriptionId,
      callbackGasLimit,
      gasPriceWei,
    })

    // Ensure that the subscription has a sufficient balance
    const estimatedCostLink = hre.ethers.utils.formatUnits(estimatedCostJuels, 18)
    const subBalanceLink = hre.ethers.utils.formatUnits(subInfo.balance, 18)
    if (subInfo.balance <= estimatedCostJuels) {
      throw Error(
        `Subscription ${subscriptionId} does not have sufficient funds. The estimated cost is ${estimatedCostLink} LINK, but the subscription only has ${subBalanceLink} LINK.`
      )
    }

    // Print the estimated cost of the Functions request in LINK & confirm before initiating the request on-chain
    await utils.prompt(
      `If the request's callback uses all ${utils.numberWithCommas(
        callbackGasLimit
      )} gas, this request will charge the subscription an estimated ${chalk.blue(estimatedCostLink + " LINK")}`
    )

    // Handle encrypted secrets
    // Docs Ref: https://github.com/smartcontractkit/functions-toolkit#encrypting-secrets
    let encryptedSecretsReference = []
    let gistUrl
    if (
      network.name !== "localFunctionsTestnet" &&
      requestConfig.secrets &&
      Object.keys(requestConfig.secrets).length > 0
    ) {
      const encryptedSecretsStr = fs
        .readFileSync(path.join(process.cwd(), "offchain-encrypted-secrets.json"))
        .toString()
      //   const encryptedSecretsStr = JSON.stringify(await secretsManager.encryptSecrets(requestConfig.secrets)) // Alternatively, encrypt directly from request config.
      switch (requestConfig.secretsLocation) {
        case Location.Inline:
          throw Error("Inline encrypted secrets are not supported for requests.")

        case Location.Remote:
          if (!process.env["GITHUB_API_TOKEN"]) {
            throw Error("GITHUB_API_TOKEN environment variable is required to upload Remote encrypted secrets.")
          }
          gistUrl = await createGist(process.env["GITHUB_API_TOKEN"], encryptedSecretsStr)
          encryptedSecretsReference = await secretsManager.encryptSecretsUrls([gistUrl])
          console.log("\nEncrypted secrets uploaded to gist at ", gistUrl)

          break

        default:
          throw Error("Invalid secretsLocation in request config - for this example use Remote only")
      }
    } else {
      requestConfig.secretsLocation = Location.Remote // Default to Remote (User-hosted) if no secrets are used
    }

    // Use a manual gas limit for the request transaction since estimated gas limit is not always accurate
    const overrides = {
      gasLimit: taskArgs.requestgaslimit,
    }

    console.log("\nSending Functions Request...")
    const requestTx = await consumerContract.sendRequest(
      requestConfig.source,
      requestConfig.secretsLocation,
      encryptedSecretsReference,
      requestConfig.args ?? [],
      requestConfig.bytesArgs ?? [],
      subscriptionId,
      callbackGasLimit,
      overrides
    )
    const requestTxReceipt = await requestTx.wait(1)
    if (network.name !== "localFunctionsTestnet") {
      console.log(
        `Transaction confirmed, see ${
          utils.getEtherscanURL(network.config.chainId) + "tx/" + requestTx.hash
        } for more details.`
      )
    }

    // Listen for fulfillment
    const requestId = requestTxReceipt.events[2].args.id
    console.log("\nRequest made. RequestId is: ", requestId)
  })
